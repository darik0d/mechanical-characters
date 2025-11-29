import React, {useRef, useState} from "react";
import SvgCanvas from "./components/SvgCanvas";
import KeyframeEditor from "./components/KeyframeEditor";

function App() {
  const [svgs, setSvgs] = useState<string[]>([]);

  const uploadSvg = async (file: File) => {
    const data = new FormData();
    data.append("file", file);

    const res = await fetch("http://localhost:5000/upload-svg", {
      method: "POST",
      body: data
    });

    const json = await res.json();
    console.log("Lol")
    console.log(json.svg_content);
    setSvgs(prev => [...prev, json.svg_content]); // frontend stores the raw SVG string
  };

  // @ts-ignore
    const canvasRef = useRef<any>();


  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <input
        type="file"
        accept=".svg"
        onChange={e => e.target.files && uploadSvg(e.target.files[0])}
      />

      <SvgCanvas ref={canvasRef} svgs={svgs} />
      <KeyframeEditor
          getParts={() => canvasRef.current.getParts()}
          setParts={(p) => canvasRef.current.setParts(p)}
        />
    </div>
  );
}

export default App;
