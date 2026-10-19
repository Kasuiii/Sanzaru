"use client";
import { useEffect, useRef, useState } from "react";
import { AslAutoSendGate } from "@/lib/asl-auto-send";
import { emptyAslSample } from "@/lib/asl-inference";
import type { AslCamera } from "./use-asl-camera";
import type { AslRoom } from "./use-asl-room";

export function useAslAutoSend(party: AslRoom, camera: AslCamera) {
    const room = party.room, modelId = camera.health?.modelId;
    const enabled = room?.mode === "ai" && room.role === "iwazaru";
    const key = enabled && room.phase === "playing" && room.requested && room.requestId && !room.hasSignal &&
        camera.status === "ready" && party.connection === "online"
        ? `${room.code}/${room.challenge}/${room.requestId}/${modelId}` : null;
    const gate = useRef(new AslAutoSendGate());
    const [sample, setSample] = useState(emptyAslSample);
    const challenge = room?.challenge, requestId = room?.requestId;
    const { action, busy } = party, { resetSample } = camera;
    useEffect(() => {
        const next = gate.current.observe(document.hidden ? null : key, camera.sample, performance.now(), !busy && !!modelId);
        // Progress is derived from distinct camera observations, not a wall-clock timer.
        setSample(next.sample);
        if (!next.proof || !key) return;
        const controller = gate.current;
        void action("sign", { ...next.proof, modelId, challenge, requestId }).then(ok => {
            resetSample();
            if (!ok) controller.retry(key, performance.now());
        });
    }, [key, camera.sample, modelId, challenge, requestId, busy, action, resetSample]);
    const status = !enabled ? "" : room.hasSignal ? "ส่งอักษรให้ Kikazaru แล้ว รอคำขอถัดไป" :
        room.phase !== "playing" ? "เริ่มนับเมื่อเกมกำลังเล่น" : !room.requested || !room.requestId ? "รอ Kikazaru ขออักษร" :
        party.connection !== "online" ? "รอเชื่อมต่อห้องใหม่" : busy ? "กำลังส่งอักษร…" :
        sample.letter ? `ถือ ${sample.letter} ต่อ · ${(sample.heldMs / 1000).toFixed(1)} / 3 วินาที` : "รออักษรเดิมที่มั่นใจเกิน 90%";
    return { enabled, sample: key ? sample : emptyAslSample(), status };
}
