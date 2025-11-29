import React from 'react';
import { useDropzone } from 'react-dropzone';

export const SvgUpload = ({ onUpload }: { onUpload: (files: File[]) => void }) => {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { 'image/svg+xml': ['.svg'] },
    onDrop: (acceptedFiles) => onUpload(acceptedFiles)
  });

  return (
    <div {...getRootProps()} style={{ border:'2px dashed gray', padding:'20px' }}>
      <input {...getInputProps()} />
      <p>Drag & drop SVG files here, or click to select files</p>
    </div>
  );
};
