import React from 'react';
import { Joint } from '../types';

export const JointEditor = ({ joints, setJoints }: { joints: Joint[]; setJoints: (j:Joint[])=>void }) => {
  return (
    <div>
      <h3>Define Joints</h3>
      <p>Click on parts to define joints (not implemented fully here)</p>
      <pre>{JSON.stringify(joints, null, 2)}</pre>
    </div>
  );
};