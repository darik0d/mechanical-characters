import React, { useState } from "react";

interface Props {
  getParts: () => any[];
  setParts: (parts: any[]) => void;
}

export default function KeyframeEditor({ getParts, setParts }: Props) {
  const [keyframes, setKeyframes] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const saveKeyframe = () => {
    const parts = getParts();
    setKeyframes(prev => [...prev, JSON.parse(JSON.stringify(parts))]);
  };

  const loadKeyframe = (index: number) => {
    setParts(JSON.parse(JSON.stringify(keyframes[index])));
    setCurrentIndex(index);
  };

  const playAnimation = () => {
    if (keyframes.length < 2) return;

    let i = 0;
    const interval = setInterval(() => {
      loadKeyframe(i);
      i++;
      if (i >= keyframes.length) {
        clearInterval(interval);
      }
    }, 300);
  };

  const sendToBackend = async () => {
    await fetch("http://localhost:5000/keyframes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyframes })
    });
  };

  return (
    <div style={{ padding: 10, background: "#ddd" }}>
      <button onClick={saveKeyframe}>Save Keyframe</button>
      <button onClick={playAnimation}>Play</button>
      <button onClick={sendToBackend}>Send to Backend</button>

      {keyframes.map((_, i) => (
        <button
          key={i}
          onClick={() => loadKeyframe(i)}
          style={{ marginLeft: 5 }}
        >
          KF {i}
        </button>
      ))}
    </div>
  );
}