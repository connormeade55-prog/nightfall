import { Mic, MicOff, MonitorUp, MonitorX, PhoneOff, Video, VideoOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { supabase } from "@/integrations/supabase/client";

/** Public STUN only: works on most home networks; very strict networks may block calls. */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

type Presence = { userId: string; name: string; mic: boolean; cam: boolean; sharing: boolean };
type Participant = Presence & { peerId: string };
type Signal = {
  from: string;
  to: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};
type PeerEntry = { pc: RTCPeerConnection; stream: MediaStream; pending: RTCIceCandidateInit[] };

function transceiver(pc: RTCPeerConnection, kind: "audio" | "video") {
  return pc.getTransceivers().find((t) => t.receiver.track.kind === kind);
}

/**
 * Video call for one chat room: peers connect directly (WebRTC) and use a
 * realtime channel only to find each other. Screen sharing swaps the camera
 * picture for the screen, so no reconnection is needed.
 */
export function useRoomCall(roomId: string, me: { userId: string; name: string }) {
  const peerId = useMemo(() => crypto.randomUUID(), []);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [localVideo, setLocalVideo] = useState<MediaStreamTrack | null>(null);
  const [state, setState] = useState({ mic: false, cam: false, sharing: false });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const joinedRef = useRef(false);
  const peers = useRef(new Map<string, PeerEntry>());
  const chains = useRef(new Map<string, Promise<void>>());
  const tracks = useRef<{ audio: MediaStreamTrack | null; cam: MediaStreamTrack | null; screen: MediaStreamTrack | null }>({
    audio: null,
    cam: null,
    screen: null,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  const send = useCallback(
    (to: string, payload: Omit<Signal, "from" | "to">) => {
      void channelRef.current?.send({ type: "broadcast", event: "signal", payload: { ...payload, from: peerId, to } });
    },
    [peerId],
  );

  const closePeer = useCallback((remoteId: string) => {
    const entry = peers.current.get(remoteId);
    if (!entry) return;
    entry.pc.close();
    peers.current.delete(remoteId);
    chains.current.delete(remoteId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[remoteId];
      return next;
    });
  }, []);

  const createPeer = useCallback(
    (remoteId: string): PeerEntry => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerEntry = { pc, stream: new MediaStream(), pending: [] };
      peers.current.set(remoteId, entry);
      pc.onicecandidate = (event) => {
        if (event.candidate) send(remoteId, { candidate: event.candidate.toJSON() });
      };
      pc.ontrack = (event) => {
        entry.stream.addTrack(event.track);
        setRemoteStreams((current) => ({ ...current, [remoteId]: entry.stream }));
      };
      return entry;
    },
    [send],
  );

  const attachLocal = useCallback(async (pc: RTCPeerConnection) => {
    const audio = transceiver(pc, "audio");
    const video = transceiver(pc, "video");
    if (audio) {
      audio.direction = "sendrecv";
      await audio.sender.replaceTrack(tracks.current.audio);
    }
    if (video) {
      video.direction = "sendrecv";
      await video.sender.replaceTrack(tracks.current.screen ?? tracks.current.cam);
    }
  }, []);

  /** Run signalling steps for one peer in order. */
  const enqueue = useCallback((remoteId: string, step: () => Promise<void>) => {
    const next = (chains.current.get(remoteId) ?? Promise.resolve()).then(step).catch((error) => {
      console.error("call signalling failed", error);
    });
    chains.current.set(remoteId, next);
  }, []);

  const connectTo = useCallback(
    (remoteId: string) => {
      enqueue(remoteId, async () => {
        if (peers.current.has(remoteId) || !joinedRef.current) return;
        const { pc } = createPeer(remoteId);
        pc.addTransceiver("audio", { direction: "sendrecv" });
        pc.addTransceiver("video", { direction: "sendrecv" });
        await attachLocal(pc);
        await pc.setLocalDescription(await pc.createOffer());
        if (pc.localDescription) send(remoteId, { description: pc.localDescription.toJSON() });
      });
    },
    [attachLocal, createPeer, enqueue, send],
  );

  const syncPeers = useCallback(
    (list: Participant[]) => {
      if (!joinedRef.current) return;
      const present = new Set(list.map((p) => p.peerId));
      for (const id of [...peers.current.keys()]) if (!present.has(id)) closePeer(id);
      // The peer with the smaller id calls the other, so two people never call each other at once.
      for (const p of list) if (p.peerId !== peerId && peerId < p.peerId) connectTo(p.peerId);
    },
    [closePeer, connectTo, peerId],
  );

  const handleSignal = useCallback(
    (signal: Signal) => {
      if (signal.to !== peerId || !joinedRef.current) return;
      const remoteId = signal.from;
      enqueue(remoteId, async () => {
        let entry = peers.current.get(remoteId);
        if (signal.description) {
          if (signal.description.type === "offer") {
            if (entry) closePeer(remoteId);
            entry = createPeer(remoteId);
            await entry.pc.setRemoteDescription(signal.description);
            await attachLocal(entry.pc);
            await entry.pc.setLocalDescription(await entry.pc.createAnswer());
            if (entry.pc.localDescription) send(remoteId, { description: entry.pc.localDescription.toJSON() });
          } else if (entry) {
            await entry.pc.setRemoteDescription(signal.description);
          }
          if (entry) {
            for (const candidate of entry.pending.splice(0)) await entry.pc.addIceCandidate(candidate);
          }
        } else if (signal.candidate) {
          if (entry?.pc.remoteDescription) await entry.pc.addIceCandidate(signal.candidate);
          else if (entry) entry.pending.push(signal.candidate);
        }
      });
    },
    [attachLocal, closePeer, createPeer, enqueue, peerId, send],
  );

  const syncRef = useRef(syncPeers);
  syncRef.current = syncPeers;
  const signalRef = useRef(handleSignal);
  signalRef.current = handleSignal;

  const stopEverything = useCallback(() => {
    joinedRef.current = false;
    for (const id of [...peers.current.keys()]) closePeer(id);
    for (const track of Object.values(tracks.current)) track?.stop();
    tracks.current = { audio: null, cam: null, screen: null };
    setLocalVideo(null);
    setState({ mic: false, cam: false, sharing: false });
    setJoined(false);
  }, [closePeer]);

  useEffect(() => {
    const channel = supabase.channel(`call-${roomId}`, {
      config: { presence: { key: peerId }, broadcast: { self: false } },
    });
    channel
      .on("presence", { event: "sync" }, () => {
        const presence = channel.presenceState<Presence>();
        const list = Object.entries(presence).flatMap(([key, metas]) => {
          const meta = metas[0];
          return meta ? [{ peerId: key, userId: meta.userId, name: meta.name, mic: meta.mic, cam: meta.cam, sharing: meta.sharing }] : [];
        });
        setParticipants(list);
        syncRef.current(list);
      })
      .on("broadcast", { event: "signal" }, ({ payload }) => signalRef.current(payload as Signal))
      .subscribe();
    channelRef.current = channel;
    return () => {
      stopEverything();
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [roomId, peerId, stopEverything]);

  const publish = useCallback(
    (next: { mic: boolean; cam: boolean; sharing: boolean }) => {
      setState(next);
      if (joinedRef.current) void channelRef.current?.track({ userId: me.userId, name: me.name, ...next });
    },
    [me.name, me.userId],
  );

  const join = useCallback(async () => {
    if (joinedRef.current || joining) return;
    setJoining(true);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: 640, height: 360 } });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        toast("No camera found, so you joined with sound only.");
      } catch {
        toast("No camera or mic allowed. You can still watch, listen and share your screen.");
      }
    }
    tracks.current.audio = stream?.getAudioTracks()[0] ?? null;
    tracks.current.cam = stream?.getVideoTracks()[0] ?? null;
    setLocalVideo(tracks.current.cam);
    joinedRef.current = true;
    setJoined(true);
    setJoining(false);
    publish({ mic: Boolean(tracks.current.audio), cam: Boolean(tracks.current.cam), sharing: false });
  }, [joining, publish]);

  const leave = useCallback(() => {
    void channelRef.current?.untrack();
    stopEverything();
  }, [stopEverything]);

  const toggleMic = useCallback(() => {
    const audio = tracks.current.audio;
    if (!audio) {
      toast("No microphone is connected.");
      return;
    }
    audio.enabled = !audio.enabled;
    publish({ ...stateRef.current, mic: audio.enabled });
  }, [publish]);

  const toggleCam = useCallback(() => {
    const cam = tracks.current.cam;
    if (!cam) {
      toast("No camera is connected.");
      return;
    }
    cam.enabled = !cam.enabled;
    publish({ ...stateRef.current, cam: cam.enabled });
  }, [publish]);

  const setOutgoingVideo = useCallback(async (track: MediaStreamTrack | null) => {
    setLocalVideo(track);
    await Promise.all(
      [...peers.current.values()].map(({ pc }) => transceiver(pc, "video")?.sender.replaceTrack(track)),
    );
  }, []);

  const stopShare = useCallback(async () => {
    tracks.current.screen?.stop();
    tracks.current.screen = null;
    await setOutgoingVideo(tracks.current.cam);
    publish({ ...stateRef.current, sharing: false });
  }, [publish, setOutgoingVideo]);

  const startShare = useCallback(async () => {
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const screen = display.getVideoTracks()[0];
      if (!screen) return;
      tracks.current.screen = screen;
      screen.onended = () => void stopShare();
      await setOutgoingVideo(screen);
      publish({ ...stateRef.current, sharing: true });
    } catch {
      // Picker closed without choosing a screen.
    }
  }, [publish, setOutgoingVideo, stopShare]);

  const canShare = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

  return {
    peerId,
    participants,
    joined,
    joining,
    remoteStreams,
    localVideo,
    state,
    canShare,
    join,
    leave,
    toggleMic,
    toggleCam,
    toggleShare: () => void (state.sharing ? stopShare() : startShare()),
  };
}

export type RoomCall = ReturnType<typeof useRoomCall>;

function VideoTile({
  stream,
  name,
  showVideo,
  muted,
  micOff,
  sharing,
  mirror,
  avatarPath,
}: {
  stream: MediaStream | null;
  name: string;
  showVideo: boolean;
  muted?: boolean;
  micOff?: boolean;
  sharing?: boolean;
  mirror?: boolean;
  avatarPath?: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-muted ring-1 ring-border">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full ${sharing ? "object-contain" : "object-cover"} ${mirror && !sharing ? "-scale-x-100" : ""} ${showVideo ? "" : "invisible"}`}
      />
      {showVideo ? null : (
        <div className="absolute inset-0 flex items-center justify-center">
          <UserAvatar path={avatarPath ?? null} name={name} className="h-16 w-16 text-2xl" />
        </div>
      )}
      <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-xs">
        {micOff ? <MicOff className="h-3 w-3 text-destructive" /> : null}
        {name}
        {sharing ? " · sharing screen" : ""}
      </span>
    </div>
  );
}

export function CallPanel({ call, myName, myAvatar }: { call: RoomCall; myName: string; myAvatar: string | null }) {
  const localStream = useMemo(() => (call.localVideo ? new MediaStream([call.localVideo]) : null), [call.localVideo]);
  const others = call.participants.filter((p) => p.peerId !== call.peerId);
  const round = "h-11 w-11 rounded-full";

  return (
    <div className="border-b border-border bg-card/40 p-3">
      <div
        className={`grid max-h-[45vh] gap-2 overflow-y-auto ${others.length === 0 ? "grid-cols-1 sm:mx-auto sm:max-w-md" : "grid-cols-1 sm:grid-cols-2"}`}
      >
        <VideoTile
          stream={localStream}
          name={`${myName} (you)`}
          showVideo={Boolean(call.localVideo) && (call.state.cam || call.state.sharing)}
          muted
          mirror
          micOff={!call.state.mic}
          sharing={call.state.sharing}
          avatarPath={myAvatar}
        />
        {others.map((p) => (
          <VideoTile
            key={p.peerId}
            stream={call.remoteStreams[p.peerId] ?? null}
            name={p.name}
            showVideo={Boolean(call.remoteStreams[p.peerId]) && (p.cam || p.sharing)}
            micOff={!p.mic}
            sharing={p.sharing}
          />
        ))}
      </div>
      {others.length === 0 ? (
        <p className="mt-2 text-center text-xs text-muted-foreground">Waiting for others to join the call…</p>
      ) : null}
      <div className="mt-3 flex items-center justify-center gap-2">
        <Button
          variant={call.state.mic ? "secondary" : "outline"}
          size="icon"
          className={round}
          onClick={call.toggleMic}
          aria-label={call.state.mic ? "Mute microphone" : "Unmute microphone"}
        >
          {call.state.mic ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
        <Button
          variant={call.state.cam ? "secondary" : "outline"}
          size="icon"
          className={round}
          onClick={call.toggleCam}
          aria-label={call.state.cam ? "Turn camera off" : "Turn camera on"}
        >
          {call.state.cam ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>
        {call.canShare ? (
          <Button
            variant={call.state.sharing ? "default" : "secondary"}
            size="icon"
            className={round}
            onClick={call.toggleShare}
            aria-label={call.state.sharing ? "Stop sharing screen" : "Share screen"}
          >
            {call.state.sharing ? <MonitorX className="h-5 w-5" /> : <MonitorUp className="h-5 w-5" />}
          </Button>
        ) : null}
        <Button
          variant="destructive"
          size="icon"
          className={round}
          onClick={call.leave}
          aria-label="Leave call"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
