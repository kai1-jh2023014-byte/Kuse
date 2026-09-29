export interface SamplePoster {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
}

const SPECS = [
  { name: "sample-night.jpg", kicker: "01", title: "NIGHT", sub: "MARKET", meta: "9.29    SAT    18:00" },
  { name: "sample-archive.jpg", kicker: "02", title: "ARCHIVE", sub: "VOL. 04", meta: "OPEN    12:00" },
  { name: "sample-live.jpg", kicker: "03", title: "LIVE", sub: "SESSION", meta: "DOOR    19:30" },
  { name: "sample-sale.jpg", kicker: "04", title: "SALE", sub: "3 DAYS", meta: "FRI  —  SUN" },
];

export function createSamplePosters(): SamplePoster[] {
  return SPECS.map((spec, index) => drawPoster(spec, index));
}

function drawPoster(
  spec: (typeof SPECS)[number],
  index: number,
): SamplePoster {
  const width = 800;
  const height = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("見本を描けませんでした");

  ctx.fillStyle = "#16181d";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#e23b2a";
  ctx.fillRect(68, 132, 188, 22);

  ctx.fillStyle = "#8d887f";
  ctx.font = "500 18px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(spec.kicker, 68, 172);

  ctx.fillStyle = "#f4f0e6";
  ctx.font = "900 118px Arial Black, Impact, sans-serif";
  const titleY = index === 2 ? 250 : 228;
  ctx.fillText(spec.title, 64, titleY);

  ctx.font = "500 28px sans-serif";
  ctx.fillText(spec.sub, 70, titleY + 132);

  ctx.fillStyle = "#e23b2a";
  ctx.font = "600 22px sans-serif";
  if (index === 3) {
    ctx.textAlign = "right";
    ctx.fillText(spec.meta, width - 68, 900);
    ctx.textAlign = "left";
  } else {
    ctx.fillText(spec.meta, 70, 900);
  }

  return {
    name: spec.name,
    width,
    height,
    dataUrl: canvas.toDataURL("image/jpeg", 0.86),
  };
}
