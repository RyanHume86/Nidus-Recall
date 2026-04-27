const THEMES = {
  dark: { stroke: "#8AAD91", bg: "#101F12", myelin: "#101F12", text: "#A8C8B0", sub: "#3A5C42" },
  light: { stroke: "#6E9275", bg: "#FFFFFF", myelin: "#FFFFFF", text: "#3A5C42", sub: "#6E9275" },
  icon: { stroke: "#8AAD91", bg: "#101F12", myelin: "#101F12", text: "#A8C8B0", sub: "#3A5C42" },
};

export default function NidusLogo({ size = 32, theme = "dark", withWordmark = false, withStrapline = false }) {
  const t = THEMES[theme] ?? THEMES.dark;
  const svgH = 104;
  const svgW = 158;
  const scale = size / svgH;
  const w = svgW * scale;

  const iconStyle = theme === "icon"
    ? { borderRadius: "22%", background: t.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: size * 0.08 }
    : {};

  const neuron = (
    <svg
      width={w}
      height={size}
      viewBox="4 6 158 104"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Dendrites */}
      <path d="M 54,60 C 46,50 38,38 32,28" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M 32,28 C 24,20 16,14 10,10" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M 32,28 C 30,22 24,24 18,30" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M 49,68 C 40,64 30,62 20,58" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M 54,77 C 46,84 38,90 30,96" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />

      {/* Soma */}
      <circle cx="60" cy="68" r="14" stroke={t.stroke} strokeWidth="2.5" />

      {/* Axon */}
      <path d="M 72,68 C 86,64 102,56 118,48 C 126,44 136,42 146,38" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />

      {/* Myelin sheaths */}
      {[77, 87, 98, 108, 119, 130, 141].map((cx, i) => (
        <ellipse key={i} cx={cx} cy={68 - (cx - 72) * 0.22} rx="5" ry="8" fill={t.myelin} stroke={t.stroke} strokeWidth="1.5" transform={`rotate(-24 ${cx} ${68 - (cx - 72) * 0.22})`} />
      ))}

      {/* Collateral */}
      <path d="M 93,60 C 97,67 99,75 97,83" stroke={t.stroke} strokeWidth="1.5" strokeLinecap="round" />

      {/* Terminal fork */}
      <path d="M 146,38 C 150,34 155,30 158,26" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M 146,38 C 150,40 154,44 156,48" stroke={t.stroke} strokeWidth="2" strokeLinecap="round" />

      {/* Synaptic vesicle dots */}
      <circle cx="158" cy="24" r="2.2" fill={t.stroke} opacity="0.85" />
      <circle cx="160" cy="30" r="1.8" fill={t.stroke} opacity="0.75" />
      <circle cx="157" cy="50" r="2.2" fill={t.stroke} opacity="0.65" />
      <circle cx="160" cy="57" r="1.5" fill={t.stroke} opacity="0.45" />
      <circle cx="99" cy="86" r="1.8" fill={t.stroke} opacity="0.40" />
    </svg>
  );

  if (!withWordmark && !withStrapline) {
    return theme === "icon" ? <span style={iconStyle}>{neuron}</span> : neuron;
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: size * 0.4 }}>
      {theme === "icon" ? <span style={iconStyle}>{neuron}</span> : neuron}
      {(withWordmark || withStrapline) && (
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {withWordmark && (
            <span style={{
              fontSize: size * 0.5,
              fontWeight: 300,
              letterSpacing: "0.45em",
              textTransform: "uppercase",
              color: t.text,
              lineHeight: 1,
            }}>
              Nidus Recall
            </span>
          )}
          {withStrapline && (
            <span style={{
              fontSize: size * 0.22,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              color: t.sub,
              lineHeight: 1,
            }}>
              remember everything
            </span>
          )}
        </span>
      )}
    </span>
  );
}
