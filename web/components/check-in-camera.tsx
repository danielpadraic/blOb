'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '~/components/ui/button';

const FACE_HINT = 'Same outfit. Face in frame.';

export function CheckInCamera({
  onCaptured,
  onCancel,
}: {
  onCaptured: (blob: Blob, fromLibrary: boolean) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setDenied(true);
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        onCaptured(blob, false);
      }
    }, 'image/jpeg', 0.86);
  }

  if (denied) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-[15px] font-bold text-ink">Camera is off. I can’t take the proof without it.</p>
        <Button type="button" onClick={() => fileRef.current?.click()}>
          Use gallery
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onCaptured(file, true);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-black">
      <video ref={videoRef} playsInline muted autoPlay className="h-full w-full flex-1 object-cover" />
      <p className="pointer-events-none absolute inset-x-0 top-10 text-center text-[13px] font-semibold text-white">
        {FACE_HINT}
      </p>
      <div className="absolute inset-x-0 bottom-6 flex items-center justify-between px-6">
        <button
          type="button"
          aria-label="Open gallery"
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black/70 text-lg text-white"
          onClick={() => fileRef.current?.click()}>
          ▤
        </button>
        <button
          type="button"
          aria-label="Take photo"
          className="h-[72px] w-[72px] rounded-full border-4 border-white bg-white/20"
          onClick={capture}
        />
        <button type="button" aria-label="Close camera" className="h-12 min-w-12 text-sm font-bold text-white" onClick={onCancel}>
          Close
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onCaptured(file, true);
          }
        }}
      />
    </div>
  );
}
