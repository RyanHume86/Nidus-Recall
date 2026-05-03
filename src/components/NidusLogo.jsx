const THEMES = {
  dark:  { stroke: "#8AAD91", bg: "#101F12", myelin: "#101F12", text: "#A8C8B0", sub: "#3A5C42" },
  light: { stroke: "#6E9275", bg: "transparent", myelin: "#FFFFFF", text: "#3A5C42", sub: "#6E9275" },
  icon:  { stroke: "#8AAD91", bg: "#101F12", myelin: "#101F12", text: "#A8C8B0", sub: "#3A5C42" },
};

// viewBox is "4 6 158 104" — native aspect ratio 158:104
const NATIVE_W = 158;
const NATIVE_H = 104;

export default function NidusLogo({ size = 32, theme = "dark", withWordmark = false, withStrapline = false }) {
  const t = THEMES[theme] ?? THEMES.dark;
  const scale = size / NATIVE_H;
  const w = NATIVE_W * scale;

  const iconStyle = theme === "icon"
    ? { borderRadius: "22%", background: t.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: size * 0.08 }
    : {};

  const neuron = (
    <svg
      width={w}
      height={size}
      viewBox="4 6 158 104"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Background — only rendered in icon/dark theme */}
      {(theme === "dark" || theme === "icon") && (
        <rect x="4" y="6" width="158" height="104" fill={t.bg} />
      )}

      {/* D1: upper-left, longer complex tree */}
      <path d="M 54,60 C 46,50 38,38 32,28" fill="none" stroke={t.stroke} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M 32,28 C 24,20 16,14 10,10" fill="none" stroke={t.stroke} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M 32,28 C 30,22 24,24 18,30" fill="none" stroke={t.stroke} strokeWidth="1.4" strokeLinecap="round"/>

      {/* D2: left, medium */}
      <path d="M 49,68 C 40,64 30,62 20,58" fill="none" stroke={t.stroke} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M 20,58 C 14,52 10,48 8,46" fill="none" stroke={t.stroke} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M 20,58 C 16,62 12,66 10,68" fill="none" stroke={t.stroke} strokeWidth="1.3" strokeLinecap="round"/>

      {/* D3: lower-left, shorter */}
      <path d="M 54,77 C 46,84 38,90 30,96" fill="none" stroke={t.stroke} strokeWidth="2.1" strokeLinecap="round"/>
      <path d="M 30,96 C 24,98 18,98 14,96" fill="none" stroke={t.stroke} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="30" y1="96" x2="28" y2="104" stroke={t.stroke} strokeWidth="1.3" strokeLinecap="round"/>

      {/* Dendritic spines */}
      <line x1="43" y1="44" x2="47" y2="40" stroke={t.stroke} strokeWidth="1.0" strokeLinecap="round"/>
      <line x1="34" y1="63" x2="36" y2="58" stroke={t.stroke} strokeWidth="1.0" strokeLinecap="round"/>
      <line x1="22" y1="17" x2="25" y2="13" stroke={t.stroke} strokeWidth="1.0" strokeLinecap="round"/>

      {/* Soma */}
      <circle cx="60" cy="68" r="14" fill={t.stroke}/>

      {/* Axon */}
      <path d="M 72,68 C 86,64 102,56 118,48 C 126,44 136,42 146,38" fill="none" stroke={t.stroke} strokeWidth="2.2" strokeLinecap="round"/>

      {/* 7 myelin sheaths, tangent-matched rotations */}
      <ellipse cx="77"  cy="67" rx="4.8" ry="1.3" fill={t.myelin} stroke={t.stroke} strokeWidth="1.9" transform="rotate(-18,77,67)"/>
      <ellipse cx="87"  cy="62" rx="4.8" ry="1.3" fill={t.myelin} stroke={t.stroke} strokeWidth="1.9" transform="rotate(-23,87,62)"/>
      <ellipse cx="98"  cy="58" rx="4.8" ry="1.3" fill={t.myelin} stroke={t.stroke} strokeWidth="1.9" transform="rotate(-25,98,58)"/>
      <ellipse cx="108" cy="53" rx="4.8" ry="1.3" fill={t.myelin} stroke={t.stroke} strokeWidth="1.9" transform="rotate(-26,108,53)"/>
      <ellipse cx="119" cy="48" rx="4.8" ry="1.3" fill={t.myelin} stroke={t.stroke} strokeWidth="1.9" transform="rotate(-25,119,48)"/>
      <ellipse cx="130" cy="44" rx="4.8" ry="1.2" fill={t.myelin} stroke={t.stroke} strokeWidth="1.9" transform="rotate(-18,130,44)"/>
      <ellipse cx="141" cy="40" rx="4.8" ry="1.2" fill={t.myelin} stroke={t.stroke} strokeWidth="1.9" transform="rotate(-19,141,40)"/>

      {/* Axon collateral from node of Ranvier between S2-S3 */}
      <path d="M 93,60 C 97,67 99,75 97,83" fill="none" stroke={t.stroke} strokeWidth="1.3" strokeLinecap="round"/>

      {/* Terminal fork */}
      <path d="M 146,38 Q 150,33 152,30" fill="none" stroke={t.stroke} strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="146" y1="38" x2="152" y2="44" stroke={t.stroke} strokeWidth="1.4" strokeLinecap="round"/>

      {/* Terminal boutons */}
      <circle cx="10"  cy="10"  r="2.8" fill={t.stroke}/>
      <circle cx="18"  cy="30"  r="2.8" fill={t.stroke}/>
      <circle cx="8"   cy="46"  r="2.8" fill={t.stroke}/>
      <circle cx="10"  cy="68"  r="2.8" fill={t.stroke}/>
      <circle cx="14"  cy="96"  r="2.8" fill={t.stroke}/>
      <circle cx="28"  cy="104" r="2.8" fill={t.stroke}/>
      <circle cx="97"  cy="83"  r="2.8" fill={t.stroke}/>
      <circle cx="152" cy="30"  r="2.8" fill={t.stroke}/>
      <circle cx="152" cy="44"  r="2.8" fill={t.stroke}/>

      {/* Synaptic vesicles — upper axon terminal */}
      <circle cx="155" cy="27" r="1.8" fill={t.stroke} opacity="0.85"/>
      <circle cx="157" cy="30" r="1.5" fill={t.stroke} opacity="0.65"/>
      <circle cx="155" cy="33" r="1.6" fill={t.stroke} opacity="0.75"/>
      <circle cx="158" cy="27" r="1.2" fill={t.stroke} opacity="0.45"/>
      <circle cx="158" cy="33" r="1.1" fill={t.stroke} opacity="0.40"/>

      {/* Synaptic vesicles — lower axon terminal */}
      <circle cx="155" cy="47" r="1.8" fill={t.stroke} opacity="0.85"/>
      <circle cx="157" cy="43" r="1.5" fill={t.stroke} opacity="0.65"/>
      <circle cx="155" cy="41" r="1.6" fill={t.stroke} opacity="0.75"/>
      <circle cx="158" cy="47" r="1.2" fill={t.stroke} opacity="0.45"/>
      <circle cx="158" cy="41" r="1.1" fill={t.stroke} opacity="0.40"/>

      {/* Synaptic vesicles — collateral terminal */}
      <circle cx="100" cy="86" r="1.8" fill={t.stroke} opacity="0.85"/>
      <circle cx="97"  cy="88" r="1.5" fill={t.stroke} opacity="0.65"/>
      <circle cx="102" cy="84" r="1.6" fill={t.stroke} opacity="0.75"/>
      <circle cx="100" cy="90" r="1.1" fill={t.stroke} opacity="0.40"/>
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
