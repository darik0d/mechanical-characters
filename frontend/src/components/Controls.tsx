import React from 'react';

export const Controls = ({ onGenerate, onRestart }: { onGenerate:()=>void, onRestart:()=>void }) => {
  return (
    <div>
      <button onClick={onGenerate}>Generate</button>
      <button onClick={onRestart}>Restart</button>
    </div>
  );
};