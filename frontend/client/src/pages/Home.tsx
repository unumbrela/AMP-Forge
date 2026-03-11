/**
 * AMP Forge Landing Page
 * Academic-focused narrative with research context.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PointCloudHero from "@/components/PointCloudHero";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Cpu,
  ExternalLink,
  Github,
  Languages,
  Layers,
  Rocket,
  Sparkles,
  Target,
} from "lucide-react";

type Locale = "en" | "zh";

function t(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

const STATIC_IMG_BASE = `${import.meta.env.BASE_URL}images/`;
const MODELS_IMG = `${STATIC_IMG_BASE}generation-models.webp`;
const EVAL_IMG = `${STATIC_IMG_BASE}evaluation-pipeline.webp`;
const ARCH_DETAIL_IMG = `${STATIC_IMG_BASE}model_structure.png`;
const LL37_RESULT_IMG = `${STATIC_IMG_BASE}result_LL37.jpg`;
const LL37V1_RESULT_IMG = `${STATIC_IMG_BASE}result_LL37v1.png`;
const BG_IMG = `${STATIC_IMG_BASE}abstract-peptide-bg.webp`;
const AMP_HOME_BG = "#f8f7f3";
const REPO_URL = "https://github.com/unumbrela/AMP-Forge";
const IGEM_LEGEND_ITEMS = [
  { label: "Cluster A", value: "cds", color: "#ff6b6b" },
  { label: "Cluster B", value: "composite", color: "#4ecdc4" },
  { label: "Cluster C", value: "regulatory", color: "#ffe66d" },
  { label: "Cluster D", value: "dna", color: "#95e1d3" },
  { label: "Cluster E", value: "protein", color: "#ff8c42" },
  { label: "Cluster F", value: "rbs", color: "#c44569" },
  { label: "Cluster G", value: "intermediate", color: "#9b59b6" },
  { label: "Cluster H", value: "reporter", color: "#3498db" },
  { label: "Cluster I", value: "promoter", color: "#2ecc71" },
  { label: "Cluster J", value: "primer", color: "#e74c3c" },
  { label: "Cluster K", value: "rna", color: "#f39c12" },
  { label: "Cluster L", value: "generator", color: "#1abc9c" },
] as const;
const IGEM_PART_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  IGEM_LEGEND_ITEMS.map((item) => [item.value, item.label]),
);

const dataSplit = [
  { split: "Train", value: 22828 },
  { split: "Val", value: 2854 },
  { split: "Test", value: 2854 },
];

const variantModes = [
  {
    mode: "c_sub",
    desc: {
      en: "Keep the N-terminus and substitute C-terminal residues.",
      zh: "保留 N 端，替换 C 端末尾位点",
    },
    focus: { en: "local edits", zh: "局部替换" },
  },
  {
    mode: "c_ext",
    desc: {
      en: "Keep the parent sequence and extend the C-terminus.",
      zh: "保留母序列并在 C 端延伸",
    },
    focus: { en: "extension", zh: "序列扩展" },
  },
  {
    mode: "c_trunc",
    desc: {
      en: "Truncate then regenerate C-terminal segment.",
      zh: "截断后重生 C 端",
    },
    focus: { en: "reconstruction", zh: "重构优化" },
  },
  {
    mode: "tag",
    desc: {
      en: "Append commonly used peptide tags.",
      zh: "追加常见 peptide tag",
    },
    focus: { en: "engineering tags", zh: "工程标签" },
  },
  {
    mode: "latent",
    desc: {
      en: "Perturb latent vectors before decoding.",
      zh: "潜空间扰动后解码",
    },
    focus: { en: "global diversity", zh: "全局多样性" },
  },
];

const unconditionalSamples = [
  { id: "generated_1", len: 7, sequence: "RNDFNPM" },
  { id: "generated_4", len: 46, sequence: "KKCWRQCYRWPWWCNCRKCCRYVCVTYRRNTRYTRSQQKHKPQNFP" },
  { id: "generated_11", len: 50, sequence: "WRRFKRYCKKHWRRYDMHRPRRKTHLPRNYKWRRRHRHRKRRRYKQKDRQ" },
  { id: "generated_31", len: 29, sequence: "WITTWTKWLMLAIHMFHKFHKFKTKKSGQ" },
  { id: "generated_56", len: 24, sequence: "WWDLWWWIKNWWPCHKHWWWKPYC" },
  { id: "generated_78", len: 27, sequence: "KLKFILKAAWALLWGAFSFYTKWNWKY" },
];

const variantSamples = [
  { mode: "c_ext", sequence: "GIGKFLHSAKKFGKAFVGEIMNSG", identity: 0.9583, editDistance: 1 },
  { mode: "c_ext", sequence: "GIGKFLHSAKKFGKAFVGEIMNSYQ", identity: 0.92, editDistance: 2 },
  { mode: "c_sub", sequence: "GIGKFLHSAKKFGKAFVGEIMNC", identity: 0.9565, editDistance: 1 },
  { mode: "c_trunc", sequence: "GIGKFLHSAKKFGKAFVGEIMQS", identity: 0.9565, editDistance: 1 },
  { mode: "latent", sequence: "GIHKFLHKAKKFAKQFLGMIMNK", identity: 0.6957, editDistance: 7 },
  { mode: "tag_his8", sequence: "GIGKFLHSAKKFGKAFVGEIMNSHHHHHHHH", identity: 0.7419, editDistance: 8 },
];

const references = [
  {
    id: 1,
    text: "Wang et al. (2025). Discovery of antimicrobial peptides with notable antibacterial potency by an LLM-based foundation model.",
    doi: "10.1126/sciadv.ads8932",
  },
  {
    id: 2,
    text: "Szymczak et al. (2023). Discovering highly potent antimicrobial peptides with deep generative model HydrAMP.",
    doi: "10.1038/s41467-023-36994-z",
  },
  {
    id: 3,
    text: "Wang et al. (2024). Diff-AMP: tailored designed antimicrobial peptide framework with all-in-one generation, identification, prediction and optimization.",
    doi: "10.1093/bib/bbae078",
  },
  {
    id: 4,
    text: "Jin et al. (2025). AMPGen: an evolutionary information-reserved and diffusion-driven generative model for de novo design.",
    doi: "10.1038/s42003-025-08282-7",
  },
  {
    id: 5,
    text: "Lin et al. (2023). Evolutionary-scale prediction of atomic-level protein structure with a language model (ESM-2).",
    doi: "10.1126/science.ade2574",
  },
  {
    id: 6,
    text: "Elnaggar et al. (2022). ProtTrans: Toward understanding the language of life through self-supervised learning (ProtT5).",
    doi: "10.1109/TPAMI.2021.3095381",
  },
  {
    id: 7,
    text: "Ho et al. (2020). Denoising Diffusion Probabilistic Models (DDPM).",
    doi: "10.48550/arXiv.2006.11239",
  },
];

function Section({
  children,
  id,
  className = "",
  withImageBg = false,
}: {
  children: ReactNode;
  id: string;
  className?: string;
  withImageBg?: boolean;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: "easeOut" }}
      className={`py-16 md:py-24 ${withImageBg ? "relative" : ""} ${className}`}
    >
      {withImageBg && (
        <div className="pointer-events-none absolute inset-0 bg-[rgba(248,247,243,0.10)]" />
      )}
      <div className={withImageBg ? "relative z-10" : ""}>{children}</div>
    </motion.section>
  );
}

function SharedPeptideBackground({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-hidden" style={{ backgroundColor: AMP_HOME_BG }}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.42),transparent_40%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.38),transparent_42%)]" />
        <div
          className="absolute top-0 left-1/2"
          style={{
            width: "min(1180px, 92vw)",
            height: "clamp(280px, 34vw, 480px)",
            transform: "translateX(calc(-50% - 2vw))",
          }}
        >
          <div
            className="absolute inset-0 bg-no-repeat opacity-[0.22]"
            style={{
              backgroundImage: `url(${BG_IMG})`,
              backgroundPosition: "center top",
              backgroundSize: "contain",
              WebkitMaskImage:
                "linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.90) 36%, rgba(0,0,0,0.46) 74%, transparent 100%)",
              maskImage:
                "linear-gradient(180deg, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.90) 36%, rgba(0,0,0,0.46) 74%, transparent 100%)",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
            }}
          />
        </div>
        <div
          className="absolute bottom-0 left-1/2"
          style={{
            width: "min(1120px, 88vw)",
            height: "clamp(240px, 31vw, 420px)",
            transform: "translateX(calc(-50% + 3vw)) scaleX(-1)",
          }}
        >
          <div
            className="absolute inset-0 bg-no-repeat opacity-[0.18]"
            style={{
              backgroundImage: `url(${BG_IMG})`,
              backgroundPosition: "center bottom",
              backgroundSize: "contain",
              WebkitMaskImage:
                "linear-gradient(0deg, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.86) 34%, rgba(0,0,0,0.40) 72%, transparent 100%)",
              maskImage:
                "linear-gradient(0deg, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.86) 34%, rgba(0,0,0,0.40) 72%, transparent 100%)",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
            }}
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,247,243,0.94)_0%,rgba(248,247,243,0.68)_12%,rgba(248,247,243,0.24)_32%,rgba(248,247,243,0.12)_50%,rgba(248,247,243,0.24)_68%,rgba(248,247,243,0.68)_88%,rgba(248,247,243,0.94)_100%)]" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function SectionNumber({ num }: { num: string }) {
  return <span className="section-number select-none mr-4 inline-block">{num}</span>;
}

function NavBar({ locale, setLocale }: { locale: Locale; setLocale: (locale: Locale) => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("hero");

  useEffect(() => {
    const onScroll = () => {
      const heroSection = document.getElementById("hero");
      if (heroSection) {
        const heroBottom = heroSection.getBoundingClientRect().bottom;
        setScrolled(heroBottom <= 88);
      } else {
        setScrolled(window.scrollY > 60);
      }
      const sections = [
        "hero",
        "amp-home",
        "overview",
        "landscape",
        "architecture",
        "data",
        "generation",
        "evaluation",
        "roadmap",
        "references",
      ];
      for (const s of sections.reverse()) {
        const el = document.getElementById(s);
        if (el && el.getBoundingClientRect().top < 200) {
          setActiveSection(s);
          break;
        }
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navItems = [
    { id: "overview", label: t(locale, "Motivation", "研究动机") },
    { id: "landscape", label: t(locale, "Positioning", "技术定位") },
    { id: "architecture", label: t(locale, "Architecture", "架构设计") },
    { id: "data", label: t(locale, "Data & Training", "数据与训练") },
    { id: "generation", label: t(locale, "Generation", "生成能力") },
    { id: "evaluation", label: t(locale, "Evaluation", "评估结果") },
    { id: "roadmap", label: t(locale, "Future Work", "未来方向") },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/95 backdrop-blur-sm shadow-sm border-b border-border" : ""
      }`}
    >
      <div className="container flex items-center justify-between h-14 gap-3">
        <a
          href="#hero"
          className={`font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight transition-colors ${
            scrolled ? "text-foreground hover:text-primary" : "text-white hover:text-white/80"
          }`}
        >
          AMP Forge
        </a>
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeSection === item.id
                  ? scrolled
                    ? "text-primary font-medium bg-primary/5"
                    : "bg-white/10 text-white"
                  : scrolled
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-white/70 hover:text-white"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors ${
            scrolled
              ? "border border-border bg-background hover:bg-secondary"
              : "border border-white/20 bg-black/20 text-white backdrop-blur-sm hover:bg-black/35"
          }`}
          aria-label={t(locale, "Switch language", "切换语言")}
        >
          <Languages className="w-3.5 h-3.5" />
          {locale === "en" ? "中文" : "EN"}
        </button>
      </div>
    </nav>
  );
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function IGEMPointCloudSection({ locale }: { locale: Locale }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedPartType, setSelectedPartType] = useState<string | null>(null);

  useEffect(() => {
    const updateProgress = () => {
      const section = sectionRef.current;
      if (!section) {
        return;
      }

      const rect = section.getBoundingClientRect();
      const totalScrollable = Math.max(section.offsetHeight - window.innerHeight, 1);
      const nextProgress = Math.min(Math.max(-rect.top / totalScrollable, 0), 1);
      setProgress(nextProgress);
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);

    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, []);

  const firstTextVisible = progress < 0.22;
  const secondTextVisible = progress >= 0.22 && progress < 0.52;
  const legendVisible = progress >= 0.52;
  const arrowVisible = progress >= 0.94;
  const convergenceProgress = Math.min(progress / 0.74, 1);
  const textStageProgress = Math.min(progress / 0.52, 1);
  const zoomStageProgress = progress <= 0.52 ? 0 : (progress - 0.52) / 0.48;
  const controlledCameraDistance = 100 + textStageProgress * 140 + zoomStageProgress * 180;

  return (
    <section id="hero" ref={sectionRef} className="relative h-[260vh] bg-[#02040a]">
      <div className="sticky top-0 h-screen overflow-hidden bg-[#02040a]">
        <div className="absolute inset-0 z-10">
          <PointCloudHero
            csvUrl={`${import.meta.env.BASE_URL}igem-composite-3d.csv`}
            className="h-full w-full"
            background="#02040a"
            showLegend={false}
            showOverlay={false}
            enableZoom={false}
            allowPageScrollOnWheel
            animateConvergence
            convergenceProgress={convergenceProgress}
            controlledCameraDistance={controlledCameraDistance}
            highlightPartType={selectedPartType}
            partTypeLabels={IGEM_PART_TYPE_LABELS}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(circle_at_15%_20%,rgba(76,201,240,0.08),transparent_32%),radial-gradient(circle_at_85%_35%,rgba(124,58,237,0.06),transparent_38%),radial-gradient(circle_at_50%_80%,rgba(8,156,55,0.05),transparent_40%)]" />

        <div
          className={`pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center transition-opacity duration-300 ${
            firstTextVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <h1 className="max-w-5xl text-5xl font-extrabold leading-[1.08] tracking-[-0.02em] text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.25)] md:text-7xl">
            {t(locale, "Lost in Sequence Space", "迷失在序列空间")}
            <br />
            {t(locale, "Buried in Candidates", "淹没于海量候选")}
          </h1>
          <p className="mt-6 text-xl font-light tracking-[0.02em] text-slate-200 drop-shadow-[0_0_16px_rgba(0,0,0,1)] md:text-3xl">
            {t(locale, "Finding the right AMP shouldn't be this hard", "找到合适的抗菌肽，不该这么困难")}
          </p>
          <div className="mt-8 h-1 w-24 rounded-full bg-gradient-to-r from-[#089c37] to-[#22c55e]" />
        </div>

        <div
          className={`pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center transition-opacity duration-300 ${
            secondTextVisible ? "opacity-100" : "opacity-0"
          }`}
        >
          <h1 className="max-w-5xl text-5xl font-extrabold leading-[1.08] tracking-[-0.02em] text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.25)] md:text-7xl">
            {t(locale, "Explore AMP Sequence Space", "探索抗菌肽序列空间")}
          </h1>
          <p className="mt-6 text-xl font-light tracking-[0.02em] text-slate-200 drop-shadow-[0_0_16px_rgba(0,0,0,1)] md:text-3xl">
            {t(locale, "Navigate AMP embeddings in 3D space", "在 3D 空间中探索 AMP 的嵌入分布")}
          </p>
          <div className="mt-8 h-1 w-24 rounded-full bg-gradient-to-r from-[#089c37] to-[#22c55e]" />
        </div>

        <div
          className={`absolute right-4 bottom-24 z-30 w-[calc(100%-2rem)] max-w-[200px] rounded-xl border border-white/20 bg-black/70 p-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-md transition-opacity duration-500 md:top-1/2 md:bottom-auto md:-translate-y-1/2 ${
            legendVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">AMP Clusters</div>
            {selectedPartType && (
              <button
                type="button"
                className="rounded border border-white/20 px-2 py-0.5 text-[10px] transition hover:bg-white/10"
                onClick={() => setSelectedPartType(null)}
                title="Clear filter"
              >
                ✕
              </button>
            )}
          </div>
          <div className="space-y-1">
            {IGEM_LEGEND_ITEMS.map((item) => {
              const active = selectedPartType === item.value;
              const dimmed = selectedPartType !== null && !active;

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSelectedPartType(active ? null : item.value)}
                  className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs transition-opacity ${
                    dimmed ? "opacity-35" : "opacity-100"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: item.color,
                      boxShadow: `0 0 8px ${item.color}`,
                    }}
                  />
                  <span>{item.label.replace("_", " ")}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 text-[11px] leading-relaxed text-white/70">
            {t(locale, "Keep scrolling to zoom out", "继续下滑会继续缩小点云")}
            <br />
            {t(locale, "Drag to move around", "拖拽可旋转查看")}
          </div>
        </div>

        <button
          type="button"
          onClick={() => scrollToSection("amp-home")}
          className={`absolute bottom-8 left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border-2 border-white/50 bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 ${
            arrowVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          aria-label={t(locale, "Scroll to project homepage", "滚动到项目主页")}
        >
          <ChevronDown className="h-5 w-5 animate-bounce" />
        </button>
      </div>
    </section>
  );
}

/* ─── Section 1: AmpHero — Research Abstract Style ─── */
function AmpHeroSection({ locale }: { locale: Locale }) {
  const contributions = [
    {
      en: "A joint Transformer VAE + latent diffusion architecture with multi-PLM backbone (ESM-2, ProtT5, Ankh) for deep sequence representation.",
      zh: "联合 Transformer VAE + 潜空间扩散架构，支持多 PLM 后端（ESM-2、ProtT5、Ankh）提取序列深层表征。",
    },
    {
      en: "Non-autoregressive parallel decoding that eliminates exposure bias, combined with 50-step CFG-guided latent diffusion for diversity–quality balance.",
      zh: "非自回归并行解码消除曝光偏差，配合 50 步 CFG 引导的潜空间扩散，兼顾多样性与生成质量。",
    },
    {
      en: "Six conditional generation modes (c_sub / c_ext / c_trunc / tag / latent / mixed) enabling precise variant control from a single parent sequence.",
      zh: "六种条件生成模式（c_sub / c_ext / c_trunc / tag / latent / mixed），从单条母序列精准控制变体设计。",
    },
    {
      en: "End-to-end reproducible pipeline with 3-phase training (VAE → RL → Diffusion) and standardized outputs (FASTA / JSON / plots).",
      zh: "端到端可复现流程：三阶段训练（VAE → RL → 扩散）+ 标准化输出（FASTA / JSON / 可视化）。",
    },
  ];

  return (
    <section
      id="amp-home"
      className="relative flex min-h-[80vh] items-end overflow-hidden pb-16 pt-24"
      style={{ backgroundColor: AMP_HOME_BG }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.32)_0%,rgba(248,247,243,0.35)_100%)]" />
      <div className="container relative z-10">
        <div className="max-w-4xl">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ delay: 0.05 }}
            className="mb-6 text-sm font-medium uppercase tracking-[0.2em] text-primary"
          >
            {t(locale, "AMP Forge · Research Summary", "AMP Forge · 研究摘要")}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ delay: 0.12, duration: 0.75 }}
            className="mb-6 text-4xl font-bold leading-[1.08] text-foreground md:text-6xl"
          >
            {t(locale, "De Novo Antimicrobial Peptide Design", "抗菌肽从头设计")}
            <br />
            <span className="text-primary">
              {t(locale, "via Latent Diffusion", "基于潜空间扩散模型")}
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ delay: 0.2 }}
            className="mb-8 max-w-3xl text-lg leading-relaxed text-muted-foreground md:text-xl"
          >
            {t(
              locale,
              "Antimicrobial resistance is a growing global health crisis, yet conventional AMP discovery remains costly and low-throughput. We propose AMP Forge, a joint Transformer VAE and latent diffusion framework that generates diverse, controllable AMP candidates through non-autoregressive parallel decoding.",
              "抗菌素耐药性是日益严峻的全球健康危机，而传统抗菌肽发现仍然成本高、通量低。我们提出 AMP Forge——一个联合 Transformer VAE 与潜空间扩散模型的框架，通过非自回归并行解码生成多样化、可控的抗菌肽候选序列。"
            )}
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ delay: 0.25 }}
            className="mb-10"
          >
            <p className="text-sm font-semibold uppercase tracking-wider text-foreground mb-3">
              {t(locale, "Key Contributions", "核心贡献")}
            </p>
            <ul className="space-y-2">
              {contributions.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <span>{locale === "zh" ? c.zh : c.en}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ delay: 0.32 }}
            className="flex flex-wrap gap-3"
          >
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <Github className="w-4 h-4" /> {t(locale, "GitHub Repository", "GitHub 仓库")} <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href="#evaluation"
              className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-md border border-border hover:border-primary/40 hover:bg-card transition-colors"
            >
              <Rocket className="w-4 h-4" /> {t(locale, "View Results", "查看结果")}
            </a>
          </motion.div>
        </div>
      </div>
      <motion.button
        type="button"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.35 }}
        onClick={() => scrollToSection("overview")}
        className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center justify-center text-muted-foreground transition hover:text-foreground"
        aria-label={t(locale, "Scroll to research motivation", "滚动到研究动机")}
      >
        <ChevronDown className="h-5 w-5 animate-bounce" />
      </motion.button>
    </section>
  );
}

/* ─── Section 2: Research Motivation & Scope (was Overview) ─── */
function OverviewSection({ locale }: { locale: Locale }) {
  return (
    <Section id="overview" withImageBg>
      <div className="container">
        <div className="flex items-start mb-10">
          <SectionNumber num="01." />
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">{t(locale, "Research Motivation & Scope", "研究动机与范围")}</h2>
            <p className="text-muted-foreground text-lg mt-3">{t(locale, "Problem definition: AMR crisis, methodological bottlenecks, and our approach", "问题定义：AMR 危机、方法瓶颈与我们的切入点")}</p>
            <div className="w-16 h-0.5 bg-primary mt-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          <div className="lg:col-span-8 prose-academic">
            <p>
              {t(
                locale,
                "Antimicrobial resistance (AMR) is recognized by the WHO as one of the top ten global health threats. Conventional antibiotic pipelines are increasingly failing against multi-drug-resistant pathogens, while wet-lab AMP discovery remains prohibitively slow, costly, and low-throughput — typically screening only hundreds of candidates per cycle.",
                "世界卫生组织将抗菌素耐药性（AMR）列为全球十大健康威胁之一。传统抗生素研发管线在多重耐药病原体面前日益乏力，而湿实验抗菌肽筛选仍然极其缓慢、成本高昂且通量有限——每轮通常只能筛选数百条候选序列。"
              )}
            </p>
            <p>
              {t(
                locale,
                "Existing computational approaches — including conditional VAEs (HydrAMP), multi-module pipelines (Diff-AMP), and LLM-based foundation models — have demonstrated generation capability but face distinct bottlenecks: limited de novo diversity in cVAE frameworks, high engineering complexity in modular systems, and prohibitive compute costs for large-model approaches. A common gap across these methods is the lack of integrated, reproducible end-to-end workflows with standardized evaluation.",
                "现有计算方法——包括条件 VAE（HydrAMP）、多模块流水线（Diff-AMP）和基于 LLM 的基础模型——虽已展示生成能力，但各自面临瓶颈：cVAE 框架从头生成多样性受限，模块化系统工程复杂度高，大模型方法计算成本难以承受。这些方法的共性缺陷在于缺乏集成化、可复现的端到端工作流和标准化评估体系。"
              )}
            </p>
            <p>
              {t(
                locale,
                "AMP Forge addresses these gaps with a joint Transformer VAE + latent diffusion architecture. By leveraging frozen pre-trained protein language models (ESM-2, ProtT5, Ankh) for deep sequence representation, compressing into a 64-dimensional latent space, and decoding through a non-autoregressive Transformer, our approach achieves controllable, diverse AMP generation with a fully scripted, reproducible pipeline.",
                "AMP Forge 通过联合 Transformer VAE + 潜空间扩散架构弥补上述不足。利用冻结的预训练蛋白质语言模型（ESM-2、ProtT5、Ankh）提取序列深层表征，压缩至 64 维潜空间，经非自回归 Transformer 解码，实现可控、多样化的抗菌肽生成，配合完全脚本化的可复现流程。"
              )}
            </p>
          </div>

          <div className="lg:col-span-4 space-y-4 lg:pt-6">
            <div className="annotation-card">
              <p className="font-medium text-foreground mb-1">{t(locale, "Data Scale", "数据规模")}</p>
              <p>
                <strong className="text-primary">28,536</strong> {t(locale, "sequences from APD3, DRAMP, and UniProt; AMP ratio ~64.2%.", "条序列，来源于 APD3、DRAMP 与 UniProt；AMP 占比约 64.2%。")}
              </p>
            </div>
            <div className="annotation-card">
              <p className="font-medium text-foreground mb-1">{t(locale, "Training Structure", "训练结构")}</p>
              <p>{t(locale, "Three-phase pipeline: VAE MLE pre-training (300 epochs) → RL adversarial fine-tuning with BiGRU discriminator (50 epochs) → latent diffusion training (500 epochs). Cyclical KL annealing + free-bits prevents posterior collapse.", "三阶段训练：VAE MLE 预训练（300 epochs）→ BiGRU 判别器 RL 对抗微调（50 epochs）→ 潜空间扩散训练（500 epochs）。周期 KL 退火 + Free-bits 防止后验坍塌。")}</p>
            </div>
            <div className="annotation-card">
              <p className="font-medium text-foreground mb-1">{t(locale, "Engineering Status", "工程状态")}</p>
              <p>{t(locale, "Fully scripted pipeline with standardized FASTA/JSON/plot outputs; open-sourced on GitHub.", "已具备完整脚本化流程和标准化 FASTA/JSON/可视化输出；已在 GitHub 开源。")}</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ─── Section 3: Technical Positioning (was Landscape) ─── */
function LandscapeSection({ locale }: { locale: Locale }) {
  const comparisonData = [
    {
      method: "HydrAMP",
      ref: "[2]",
      architecture: { en: "Conditional VAE", zh: "条件 VAE" },
      generation: { en: "Autoregressive", zh: "自回归" },
      controllability: { en: "Goal-guided optimization", zh: "目标引导优化" },
      training: { en: "Single-stage", zh: "单阶段" },
      openSource: true,
    },
    {
      method: "Diff-AMP",
      ref: "[3]",
      architecture: { en: "Multi-module pipeline", zh: "多模块流水线" },
      generation: { en: "Generate+Identify+Predict+Optimize", zh: "生成+识别+预测+优化" },
      controllability: { en: "Module-level control", zh: "模块级控制" },
      training: { en: "Per-module", zh: "逐模块训练" },
      openSource: true,
    },
    {
      method: "AMPGen",
      ref: "[4]",
      architecture: { en: "Evolutionary + Diffusion", zh: "进化信息 + 扩散" },
      generation: { en: "Diffusion-based", zh: "扩散生成" },
      controllability: { en: "Target-aware design", zh: "靶向设计" },
      training: { en: "Multi-stage", zh: "多阶段" },
      openSource: false,
    },
    {
      method: "LLM Foundation",
      ref: "[1]",
      architecture: { en: "Large language model", zh: "大语言模型" },
      generation: { en: "Autoregressive", zh: "自回归" },
      controllability: { en: "Prompt-based", zh: "提示词引导" },
      training: { en: "Pre-train + fine-tune", zh: "预训练 + 微调" },
      openSource: false,
    },
    {
      method: "AMP Forge (ours)",
      ref: "",
      architecture: { en: "Transformer VAE + Latent Diffusion", zh: "Transformer VAE + 潜空间扩散" },
      generation: { en: "Non-autoregressive parallel", zh: "非自回归并行" },
      controllability: { en: "6 conditional modes + CFG", zh: "6 种条件模式 + CFG" },
      training: { en: "3-phase (VAE→RL→Diffusion)", zh: "三阶段 (VAE→RL→扩散)" },
      openSource: true,
    },
  ];

  const advantages = [
    {
      en: "Multi-PLM backbone (ESM-2 / ProtT5 / Ankh) with frozen pre-trained weights for robust sequence representation.",
      zh: "多 PLM 后端（ESM-2 / ProtT5 / Ankh），冻结预训练权重，序列表征鲁棒。",
    },
    {
      en: "Non-autoregressive decoding eliminates exposure bias; 50-step latent diffusion with CFG balances diversity and quality.",
      zh: "非自回归解码消除曝光偏差；50 步潜空间扩散 + CFG 引导兼顾多样性与质量。",
    },
    {
      en: "6 conditional generation modes for precise, controllable variant design from a single parent sequence.",
      zh: "6 种条件生成模式，从单条母序列精准控制变体设计。",
    },
    {
      en: "Fully reproducible pipeline with standardized outputs (FASTA / JSON / plots) for cross-version comparisons.",
      zh: "完全可复现的流程，标准化输出（FASTA / JSON / 可视化）支持版本间对比。",
    },
  ];

  return (
    <Section id="landscape" withImageBg>
      <div className="container">
        <div className="flex items-start mb-10">
          <SectionNumber num="02." />
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">{t(locale, "Technical Positioning", "技术定位")}</h2>
            <p className="text-muted-foreground text-lg mt-3">{t(locale, "Comparative analysis of AMP generation approaches", "抗菌肽生成方法横向对比分析")}</p>
            <div className="w-16 h-0.5 bg-primary mt-3" />
          </div>
        </div>

        <div className="mb-8">
          <p className="prose-academic text-muted-foreground mb-6">
            {t(
              locale,
              "The table below provides an objective feature comparison across representative AMP generation methods. Each approach offers distinct trade-offs in architecture complexity, generation mode, controllability, and reproducibility.",
              "下表对代表性抗菌肽生成方法进行客观特征对比。每种方法在架构复杂度、生成方式、可控性和可复现性方面各有取舍。"
            )}
          </p>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/60 text-left">
                  <th className="px-4 py-3 font-semibold">{t(locale, "Method", "方法")}</th>
                  <th className="px-4 py-3 font-semibold">{t(locale, "Architecture", "架构")}</th>
                  <th className="px-4 py-3 font-semibold">{t(locale, "Generation Mode", "生成方式")}</th>
                  <th className="px-4 py-3 font-semibold">{t(locale, "Controllability", "可控性")}</th>
                  <th className="px-4 py-3 font-semibold">{t(locale, "Training Pipeline", "训练流程")}</th>
                  <th className="px-4 py-3 font-semibold text-center">{t(locale, "Open Source", "开源")}</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, i) => {
                  const isOurs = row.method.includes("ours");
                  return (
                    <tr
                      key={row.method}
                      className={`border-t border-border ${isOurs ? "bg-primary/5 font-medium" : i % 2 === 0 ? "bg-card" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <span className={isOurs ? "text-primary font-semibold" : ""}>{row.method}</span>
                        {row.ref && <span className="text-xs text-muted-foreground ml-1">{row.ref}</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{locale === "zh" ? row.architecture.zh : row.architecture.en}</td>
                      <td className="px-4 py-3 text-muted-foreground">{locale === "zh" ? row.generation.zh : row.generation.en}</td>
                      <td className="px-4 py-3 text-muted-foreground">{locale === "zh" ? row.controllability.zh : row.controllability.en}</td>
                      <td className="px-4 py-3 text-muted-foreground">{locale === "zh" ? row.training.zh : row.training.en}</td>
                      <td className="px-4 py-3 text-center">{row.openSource ? "✓" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg overflow-hidden border border-border bg-card mb-8">
          <img src={MODELS_IMG} alt="AMP Forge model architecture overview" className="w-full" />
        </div>

        <div className="bg-card rounded-lg border border-border p-5">
          <p className="font-semibold mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" /> {t(locale, "Our Advantages", "我们的优势")}
          </p>
          <ul className="space-y-2">
            {advantages.map((adv, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>{locale === "zh" ? adv.zh : adv.en}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

/* ─── Section 4: Architecture (simplified) ─── */
function ArchitectureSection({ locale }: { locale: Locale }) {
  return (
    <Section id="architecture" withImageBg>
      <div className="container">
        <div className="flex items-start mb-10">
          <SectionNumber num="03." />
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">{t(locale, "Architecture Design", "架构设计")}</h2>
            <p className="text-muted-foreground text-lg mt-3">
              {t(locale, "PLM representation, VAE compression, latent diffusion, and non-autoregressive Transformer decoding", "PLM 表征、VAE 压缩、潜空间扩散与非自回归Transformer解码")}
            </p>
            <div className="w-16 h-0.5 bg-primary mt-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          <div className="lg:col-span-8">
            <div className="rounded-lg overflow-hidden border border-border bg-card mb-6">
              <img src={ARCH_DETAIL_IMG} alt="Architecture module detail diagram" className="w-full" />
            </div>

            <div className="bg-card rounded-lg border border-border p-5">
              <h3 className="text-lg font-semibold mb-3">{t(locale, "Core Modules", "核心模块")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="rounded-md border border-border p-4">
                  <p className="font-semibold mb-1">PLM Extractor</p>
                  <p className="text-muted-foreground">{t(locale, "Frozen ESM-2 / Ankh / ProtT5 backends; per-residue embeddings (320–1024 dim).", "冻结的 ESM-2 / Ankh / ProtT5 后端；逐残基嵌入（320–1024 维）。")}</p>
                </div>
                <div className="rounded-md border border-border p-4">
                  <p className="font-semibold mb-1">Hybrid AA Encoding</p>
                  <p className="text-muted-foreground">{t(locale, "BLOSUM62 evolutionary features (20d) + learnable task-specific embeddings (16d) = 36d residue representation.", "BLOSUM62 进化特征（20 维）+ 可学习任务嵌入（16 维）= 36 维残基表示。")}</p>
                </div>
                <div className="rounded-md border border-border p-4">
                  <p className="font-semibold mb-1">BiGRU Encoder + Non-AR Decoder</p>
                  <p className="text-muted-foreground">{t(locale, "Bidirectional GRU encodes to (μ, σ); 3-layer Transformer decodes all positions in parallel.", "双向 GRU 编码为 (μ, σ)；3 层 Transformer 并行解码全部位点。")}</p>
                </div>
                <div className="rounded-md border border-border p-4">
                  <p className="font-semibold mb-1">Latent Diffusion</p>
                  <p className="text-muted-foreground">{t(locale, "50-step Gaussian denoising in 64-dim latent space; cosine schedule + CFG guidance.", "64 维潜空间中 50 步高斯去噪；余弦调度 + CFG 引导。")}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4 lg:pt-2">
            <div className="annotation-card">
              <p className="font-medium text-foreground mb-1">{t(locale, "Latent Space", "潜空间")}</p>
              <p>
                <strong className="text-primary">64</strong>-dim latent space; <strong className="text-primary">T = 50</strong> {t(locale, "diffusion steps with cosine schedule.", "扩散步数，cosine schedule。")}
              </p>
            </div>
            <div className="annotation-card">
              <p className="font-medium text-foreground mb-1">{t(locale, "Max Sequence Length", "最大序列长度")}</p>
              <p>
                <strong className="text-primary">50 AA</strong>{t(locale, ", aligned with data cleaning rules.", "，与数据清洗规则保持一致。")}
              </p>
            </div>
            <div className="annotation-card">
              <p className="font-medium text-foreground mb-1">{t(locale, "Sampling Controls", "生成策略")}</p>
              <p>{t(locale, "Supports top-p / top-k / temperature and CFG guidance at inference time.", "推理阶段支持 top-p / top-k / 温度调节与 CFG 条件引导。")}</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ─── Section 5: Data & Training (minor adjustments) ─── */
function DataTrainingSection({ locale }: { locale: Locale }) {
  return (
    <Section id="data" withImageBg>
      <div className="container">
        <div className="flex items-start mb-10">
          <SectionNumber num="04." />
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">{t(locale, "Data & Training", "数据与训练")}</h2>
            <p className="text-muted-foreground text-lg mt-3">{t(locale, "Integrated data distribution, property coverage, and staged training", "数据分布、属性覆盖与分阶段训练")}</p>
            <div className="w-16 h-0.5 bg-primary mt-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          <div className="lg:col-span-7">
            <h3 className="text-xl font-semibold mb-4">{t(locale, "Dataset Split", "数据集划分")}</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {t(
                locale,
                "Training data is curated from three primary databases: APD3 (Antimicrobial Peptide Database), DRAMP (Data Repository of Antimicrobial Peptides), and UniProt. After deduplication, length filtering (≤50 AA), and quality control, 28,536 sequences are retained with an 80/10/10 train/val/test split.",
                "训练数据整合自三个主要数据库：APD3（抗菌肽数据库）、DRAMP（抗菌肽数据仓库）和 UniProt。经去重、长度过滤（≤50 AA）和质量控制后，保留 28,536 条序列，按 80/10/10 比例划分训练/验证/测试集。"
              )}
            </p>
            <div className="bg-card rounded-lg border border-border p-5 mb-8">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dataSplit}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.01 90)" />
                  <XAxis dataKey="split" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.99 0.003 90)",
                      border: "1px solid oklch(0.88 0.01 90)",
                      borderRadius: "8px",
                      fontSize: "13px",
                    }}
                  />
                  <Bar dataKey="value" name="Sequences" fill="oklch(0.65 0.2 25)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>

          <div className="lg:col-span-5">
            <h3 className="text-xl font-semibold mb-4">{t(locale, "Training Flow (3 stages)", "训练流程（3 阶段）")}</h3>
            <div className="space-y-4">
              <div className="bg-card rounded-lg border border-border p-5">
                <p className="font-semibold mb-2">{t(locale, "Phase 1A · VAE Pretraining", "Phase 1A · VAE 预训练")}</p>
                <p className="text-sm text-muted-foreground mb-3">{t(locale, "Learn latent representations and baseline reconstruction.", "学习潜变量表示与基础重建能力。")}</p>
                <code className="text-xs bg-secondary px-2 py-1 rounded block">python training/train_vae.py --config configs/default.yaml</code>
              </div>
              <div className="bg-card rounded-lg border border-border p-5">
                <p className="font-semibold mb-2">{t(locale, "Phase 1B · RL Tuning", "Phase 1B · RL 微调")}</p>
                <p className="text-sm text-muted-foreground mb-3">{t(locale, "Improve generation quality via discriminator and policy-gradient signals.", "通过判别器与策略梯度提升生成质量。")}</p>
                <code className="text-xs bg-secondary px-2 py-1 rounded block">python training/train_vae_rl.py --config configs/default.yaml --vae-checkpoint checkpoints/vae_best.pt</code>
              </div>
              <div className="bg-card rounded-lg border border-border p-5">
                <p className="font-semibold mb-2">{t(locale, "Phase 2 · Diffusion Training", "Phase 2 · 扩散训练")}</p>
                <p className="text-sm text-muted-foreground mb-3">{t(locale, "Learn denoising in latent space to improve diversity.", "在潜空间学习去噪采样，增强多样性。")}</p>
                <code className="text-xs bg-secondary px-2 py-1 rounded block">python training/train_diffusion.py --config configs/default.yaml --vae-checkpoint checkpoints/vae_best_recon.pt</code>
              </div>
            </div>

            <div className="annotation-card mt-5">
              <p className="font-medium text-foreground mb-1">{t(locale, "Data Sources", "数据来源")}</p>
              <p>{t(locale, "APD3, DRAMP, and UniProt merged into a unified AMP-oriented format with standardized cleaning.", "APD3、DRAMP 与 UniProt 合并，统一到 AMP 任务格式并标准化清洗。")}</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ─── Section 6: Generation (optimized display) ─── */
function GenerationSection({ locale }: { locale: Locale }) {
  return (
    <Section id="generation" withImageBg>
      <div className="container">
        <div className="flex items-start mb-10">
          <SectionNumber num="05." />
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">{t(locale, "Generation", "生成能力")}</h2>
            <p className="text-muted-foreground text-lg mt-3">{t(locale, "De novo generation + 6 conditional variant modes + real output samples", "de novo 生成 + 6 种条件变体模式 + 真实输出样例")}</p>
            <div className="w-16 h-0.5 bg-primary mt-3" />
          </div>
        </div>

        <Tabs defaultValue="uncond" className="mb-10">
          <TabsList className="mb-6 bg-secondary">
            <TabsTrigger value="uncond">{t(locale, "Unconditional", "无条件生成")}</TabsTrigger>
            <TabsTrigger value="variant">{t(locale, "Variants", "变体生成")}</TabsTrigger>
            <TabsTrigger value="interp">{t(locale, "Latent Interpolation", "潜空间插值")}</TabsTrigger>
          </TabsList>

          <TabsContent value="uncond">
            <div className="bg-card rounded-lg border border-border p-6">
              <p className="text-sm text-muted-foreground mb-4">{t(locale, "Sample from the learned latent diffusion prior to generate novel AMP candidates without any input sequence.", "从学习到的潜空间扩散先验直接采样，无需输入序列即可生成全新 AMP 候选。")}</p>
              <pre className="text-xs bg-secondary rounded-md p-4 overflow-x-auto"><code>{`python generation/unconditional.py \\
  --config configs/default.yaml \\
  --checkpoint checkpoints/esm_diffvae_full.pt \\
  --n-samples 100 \\
  --top-p 0.9`}</code></pre>

              <div className="mt-5">
                <p className="font-semibold mb-2">{t(locale, "Real output samples (unconditional_generated.fasta)", "真实生成样例（unconditional_generated.fasta）")}</p>
                <p className="text-xs text-muted-foreground mb-3">{t(locale, "Sequences below are copied from `esm_diffvae/results/unconditional_generated.fasta`.", "以下序列直接来自 `esm_diffvae/results/unconditional_generated.fasta` 的实际输出。")}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {unconditionalSamples.map((sample) => (
                    <div key={sample.id} className="rounded-md border border-border bg-secondary/60 p-3">
                      <p className="text-xs text-muted-foreground mb-1 font-mono">
                        {sample.id} · len={sample.len}
                      </p>
                      <code className="text-xs break-all">{sample.sequence}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="variant">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-card rounded-lg border border-border p-6">
                <p className="text-sm text-muted-foreground mb-4">{t(locale, "Generate structure-aware variants from a parent sequence, including mixed-mode scheduling.", "基于母序列生成结构可控变体，支持混合模式调度。")}</p>
                <pre className="text-xs bg-secondary rounded-md p-4 overflow-x-auto"><code>{`python generation/variant.py \\
  --config configs/default.yaml \\
  --checkpoint checkpoints/esm_diffvae_full.pt \\
  --input-sequence "GIGKFLHSAKKFGKAFVGEIMNS" \\
  --mode mixed \\
  --n-variants 50`}</code></pre>

                <div className="mt-5 rounded-md border border-border bg-secondary/40 p-4">
                  <p className="text-sm font-medium mb-2">{t(locale, "Real variant samples (variants_generated.json)", "真实变体样例（variants_generated.json）")}</p>
                  <p className="text-xs text-muted-foreground mb-3 font-mono">parent: GIGKFLHSAKKFGKAFVGEIMNS</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left border-b border-border">
                          <th className="py-1 pr-2">{t(locale, "mode", "模式")}</th>
                          <th className="py-1 pr-2">{t(locale, "identity", "一致性")}</th>
                          <th className="py-1 pr-2">{t(locale, "edit", "编辑距离")}</th>
                          <th className="py-1">{t(locale, "sequence", "序列")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variantSamples.map((item) => {
                          const isLatent = item.mode === "latent";
                          return (
                            <tr key={`${item.mode}-${item.sequence}`} className={`border-b border-border/50 last:border-b-0 ${isLatent ? "bg-amber-50/60" : ""}`}>
                              <td className="py-1 pr-2 font-mono">{item.mode}</td>
                              <td className={`py-1 pr-2 ${isLatent ? "text-amber-700 font-medium" : ""}`}>{item.identity.toFixed(4)}</td>
                              <td className={`py-1 pr-2 ${isLatent ? "text-amber-700 font-medium" : ""}`}>{item.editDistance}</td>
                              <td className="py-1 font-mono break-all">{item.sequence}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    {t(locale, "* Latent mode shows lower identity (higher diversity) due to global perturbation in latent space.", "* latent 模式因潜空间全局扰动导致一致性较低（多样性更高）。")}
                  </p>
                </div>
              </div>
              <div className="lg:col-span-5 bg-card rounded-lg border border-border p-6">
                <p className="font-semibold mb-3">{t(locale, "Variant Mode Matrix", "变体模式矩阵")}</p>
                <div className="space-y-2">
                  {variantModes.map((v) => (
                    <div key={v.mode} className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-b-0">
                      <div>
                        <p className="text-sm font-medium font-mono">{v.mode}</p>
                        <p className="text-xs text-muted-foreground">{locale === "zh" ? v.desc.zh : v.desc.en}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{locale === "zh" ? v.focus.zh : v.focus.en}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="interp">
            <div className="bg-card rounded-lg border border-border p-6">
              <p className="text-sm text-muted-foreground mb-4">
                {t(
                  locale,
                  "Latent interpolation generates intermediate sequences between two AMP endpoints by linearly interpolating their latent vectors. This produces a smooth sequence-family transition, useful for exploring the functional landscape between known AMPs and understanding how latent space geometry corresponds to sequence properties.",
                  "潜空间插值通过线性插值两条 AMP 端点的潜向量来生成中间序列。这会产生平滑的序列族过渡，有助于探索已知 AMP 之间的功能景观，理解潜空间几何与序列性质之间的对应关系。"
                )}
              </p>
              <pre className="text-xs bg-secondary rounded-md p-4 overflow-x-auto"><code>{`python generation/interpolation.py \\
  --config configs/default.yaml \\
  --checkpoint checkpoints/esm_diffvae_full.pt \\
  --seq-a "GIGKFLHSAKKFGKAFVGEIMNS" \\
  --seq-b "ILPWKWPWWPWRR" \\
  --n-steps 10`}</code></pre>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Section>
  );
}

/* ─── Section 7: Evaluation (strengthened with baseline comparison) ─── */
function EvaluationSection({ locale }: { locale: Locale }) {
  const baselineComparison = [
    {
      dimension: { en: "Uniqueness", zh: "唯一性" },
      ours: "1.00",
      hydramp: "~0.99",
      diffamp: "~0.95",
      note: { en: "Fraction of non-duplicate sequences in generated set", zh: "生成集合中不重复序列的比例" },
    },
    {
      dimension: { en: "Novelty", zh: "新颖性" },
      ours: "1.00",
      hydramp: "~0.85",
      diffamp: "~0.90",
      note: { en: "Fraction of sequences not found in training set", zh: "不在训练集中的序列比例" },
    },
    {
      dimension: { en: "Diversity", zh: "多样性" },
      ours: "0.853",
      hydramp: "~0.60",
      diffamp: "~0.70",
      note: { en: "Mean pairwise normalized edit distance", zh: "平均两两归一化编辑距离" },
    },
    {
      dimension: { en: "Controllability", zh: "可控性" },
      ours: { en: "6 modes + CFG", zh: "6 种模式 + CFG" },
      hydramp: { en: "Goal-guided", zh: "目标引导" },
      diffamp: { en: "Module-level", zh: "模块级" },
      note: { en: "Degree of user control over generation", zh: "用户对生成过程的控制程度" },
    },
    {
      dimension: { en: "Training Simplicity", zh: "训练简洁度" },
      ours: { en: "3-phase scripted", zh: "三阶段脚本化" },
      hydramp: { en: "Single-stage", zh: "单阶段" },
      diffamp: { en: "Per-module", zh: "逐模块" },
      note: { en: "Complexity and reproducibility of training", zh: "训练的复杂度与可复现性" },
    },
  ];

  const micArchSteps = [
    {
      label: { en: "ESM-2 Embeddings", zh: "ESM-2 嵌入" },
      detail: { en: "Pre-computed 480-dim residue representations from a 35M-parameter protein language model", zh: "基于 3500 万参数蛋白质语言模型预计算的 480 维残基表示" },
    },
    {
      label: { en: "Dual-Branch Encoding", zh: "双分支编码" },
      detail: { en: "Global branch (multi-head attention + statistical pooling) captures sequence-level patterns; local branch (multi-scale CNN with kernels 3/5/7) extracts motif-level features", zh: "全局分支（多头注意力 + 统计池化）捕获序列级模式；局部分支（多尺度 CNN，核宽 3/5/7）提取基序级特征" },
    },
    {
      label: { en: "Gated Fusion", zh: "门控融合" },
      detail: { en: "A learned sigmoid gate adaptively weights global vs. local contributions per sample, replacing naive concatenation", zh: "学习的 sigmoid 门控按样本自适应调节全局与局部贡献权重，替代朴素拼接" },
    },
    {
      label: { en: "Physicochemical Features", zh: "理化特征" },
      detail: { en: "11 descriptors (charge, hydrophobicity, molecular weight, aromaticity, etc.) encoded via MLP and fused with sequence features", zh: "11 种描述符（电荷、疏水性、分子量、芳香性等）经 MLP 编码后与序列特征融合" },
    },
    {
      label: { en: "Multi-Seed Snapshot Ensemble", zh: "多种子快照集成" },
      detail: { en: "3 random seeds x 7 top-checkpoint snapshots = 21-model ensemble for robust prediction with post-hoc linear calibration", zh: "3 随机种子 x 7 最优检查点快照 = 21 模型集成，结合训练后线性校准实现稳健预测" },
    },
  ];

  return (
    <Section id="evaluation" withImageBg>
      <div className="container">
        <div className="flex items-start mb-10">
          <SectionNumber num="06." />
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">{t(locale, "Evaluation & Validation", "评估结果与验证")}</h2>
            <p className="text-muted-foreground text-lg mt-3">{t(locale, "Generation quality metrics, MIC prediction, and wet-lab validation", "生成质量指标、MIC 预测与湿实验验证")}</p>
            <div className="w-16 h-0.5 bg-primary mt-3" />
          </div>
        </div>

        {/* --- Generation Quality --- */}
        <div className="mb-12">
          <h3 className="text-xl font-semibold mb-4">{t(locale, "Generation Quality", "生成质量")}</h3>

          <div className="rounded-lg overflow-hidden border border-border bg-card mb-6">
            <img src={EVAL_IMG} alt="evaluation pipeline" className="w-full" />
            <p className="text-xs text-muted-foreground px-4 py-2 italic">
              {t(locale, "Figure: Evaluation pipeline covers sequence quality, functional tendency, and safety-related indicators.", "图：评估流程覆盖序列质量、功能倾向与安全相关指标。")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-card rounded-lg border border-border p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t(locale, "Uniqueness", "唯一性")}</p>
              <p className="text-2xl font-bold text-primary mt-1">1.00</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "500/500 unique — all generated sequences are distinct", "500/500 无重复——所有生成序列互不相同")}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t(locale, "Novelty", "新颖性")}</p>
              <p className="text-2xl font-bold text-primary mt-1">1.00</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "None found in training set — true de novo generation", "不在训练集中——真正的从头生成")}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t(locale, "Mean Length", "平均长度")}</p>
              <p className="text-2xl font-bold text-primary mt-1">25.54</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "AA — within typical AMP range (10–50 AA)", "AA——在典型 AMP 范围内（10–50 AA）")}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t(locale, "Mean Diversity", "平均多样性")}</p>
              <p className="text-2xl font-bold text-primary mt-1">0.853</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "Normalized edit distance — high inter-sequence variability", "归一化编辑距离——序列间高变异性")}</p>
            </div>
          </div>

          <div className="mb-6">
            <h4 className="text-lg font-semibold mb-3">{t(locale, "Qualitative Comparison with Baselines", "与基线方法的定性对比")}</h4>
            <p className="text-sm text-muted-foreground mb-4">
              {t(
                locale,
                "The following comparison is based on publicly reported results from each method's original publications. Approximate values (marked with ~) are estimated from published figures and tables.",
                "以下对比基于各方法原始论文中的公开报告结果。带 ~ 标记的近似值是从已发表的图表中估计的。"
              )}
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/60 text-left">
                    <th className="px-4 py-3 font-semibold">{t(locale, "Dimension", "维度")}</th>
                    <th className="px-4 py-3 font-semibold text-primary">AMP Forge (ours)</th>
                    <th className="px-4 py-3 font-semibold">HydrAMP</th>
                    <th className="px-4 py-3 font-semibold">Diff-AMP</th>
                    <th className="px-4 py-3 font-semibold">{t(locale, "Metric Note", "指标说明")}</th>
                  </tr>
                </thead>
                <tbody>
                  {baselineComparison.map((row, i) => (
                    <tr key={i} className={`border-t border-border ${i % 2 === 0 ? "bg-card" : ""}`}>
                      <td className="px-4 py-3 font-medium">{locale === "zh" ? row.dimension.zh : row.dimension.en}</td>
                      <td className="px-4 py-3 text-primary font-semibold">
                        {typeof row.ours === "string" ? row.ours : locale === "zh" ? row.ours.zh : row.ours.en}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {typeof row.hydramp === "string" ? row.hydramp : locale === "zh" ? row.hydramp.zh : row.hydramp.en}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {typeof row.diffamp === "string" ? row.diffamp : locale === "zh" ? row.diffamp.zh : row.diffamp.en}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{locale === "zh" ? row.note.zh : row.note.en}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* --- MIC Prediction --- */}
        <div className="mb-12">
          <h3 className="text-xl font-semibold mb-3">{t(locale, "MIC Prediction — ESM-MIC", "MIC 预测——ESM-MIC")}</h3>
          <p className="text-sm text-muted-foreground mb-6">
            {t(
              locale,
              "Generating novel AMP sequences is only half the story — predicting their antimicrobial potency before synthesis is equally critical. We developed ESM-MIC, a gated multi-branch regression model that predicts the Minimum Inhibitory Concentration (MIC) of peptide sequences directly from pre-computed ESM-2 embeddings, enabling rapid in-silico screening of generated candidates without costly wet-lab assays.",
              "生成新颖的 AMP 序列只是故事的一半——在合成之前预测其抗菌效力同样关键。我们开发了 ESM-MIC，一种门控多分支回归模型，直接从预计算的 ESM-2 嵌入预测肽序列的最小抑菌浓度（MIC），实现对生成候选序列的快速计算筛选，无需昂贵的湿实验。"
            )}
          </p>

          {/* Architecture Pipeline */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold mb-4">{t(locale, "Model Architecture", "模型架构")}</h4>
            <div className="relative">
              {micArchSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-4 mb-1 last:mb-0">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {i + 1}
                    </div>
                    {i < micArchSteps.length - 1 && <div className="w-px h-6 bg-border" />}
                  </div>
                  <div className="pb-2">
                    <p className="font-medium text-sm">{locale === "zh" ? step.label.zh : step.label.en}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{locale === "zh" ? step.detail.zh : step.detail.en}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-card rounded-lg border border-border p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t(locale, "Pearson Correlation", "皮尔逊相关系数")}</p>
              <p className="text-2xl font-bold text-primary mt-1">0.9016</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "21-model ensemble on held-out test set", "21 模型集成在留出测试集上的表现")}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">R²</p>
              <p className="text-2xl font-bold text-primary mt-1">0.8124</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "Coefficient of determination — strong explanatory power", "决定系数——强解释力")}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">{t(locale, "Spearman Rank", "斯皮尔曼秩")}</p>
              <p className="text-2xl font-bold text-primary mt-1">0.8808</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "Rank-order correlation — reliable for candidate ranking", "秩序相关——候选序列排序可靠")}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">RMSE</p>
              <p className="text-2xl font-bold text-primary mt-1">0.574</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "log-MIC units — less than 4× error in concentration", "log-MIC 单位——浓度误差小于 4 倍")}</p>
            </div>
          </div>

          {/* Training Strategy Highlights */}
          <div className="bg-card rounded-lg border border-border p-5 mb-6">
            <h4 className="text-lg font-semibold mb-3">{t(locale, "Key Training Strategies", "关键训练策略")}</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="font-medium mb-1">{t(locale, "Data Cleaning", "数据清洗")}</p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    locale,
                    "Out-of-fold residual analysis identifies and removes ~11.5% noisy samples, boosting PCC from 0.71 to 0.89 with cleaner labels.",
                    "折外残差分析识别并去除约 11.5% 的噪声样本，通过更干净的标签将 PCC 从 0.71 提升至 0.89。"
                  )}
                </p>
              </div>
              <div>
                <p className="font-medium mb-1">{t(locale, "Quadruple Augmentation", "四重数据增强")}</p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    locale,
                    "Embedding Gaussian noise, random residue masking (15%), Mixup interpolation, and label noise work together to regularize a 1.6M-parameter model on ~4,700 training samples.",
                    "嵌入高斯噪声、随机残基掩码（15%）、Mixup 插值与标签噪声协同正则化，使 160 万参数模型在约 4700 个训练样本上有效学习。"
                  )}
                </p>
              </div>
              <div>
                <p className="font-medium mb-1">{t(locale, "Snapshot Ensemble", "快照集成")}</p>
                <p className="text-xs text-muted-foreground">
                  {t(
                    locale,
                    "Training 3 models with different random seeds and retaining the top-7 checkpoints from each yields a 21-model ensemble, pushing PCC past 0.90 with no extra architecture cost.",
                    "使用 3 个不同随机种子训练，每个保留 top-7 检查点，组成 21 模型集成，将 PCC 推至 0.90 以上，无额外架构成本。"
                  )}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground italic">
            {t(
              locale,
              "ESM-MIC is trained on ~5,300 AMP sequences with experimentally measured MIC values curated from the project's cross-database corpus. The model enables automated prioritization of AMP Forge outputs before wet-lab validation.",
              "ESM-MIC 基于项目跨数据库语料库中约 5300 条具有实验测定 MIC 值的 AMP 序列训练。该模型实现了在湿实验验证前对 AMP Forge 生成结果的自动化优先级排序。"
            )}
          </p>
        </div>

        {/* --- Wet-Lab Validation --- */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-3">{t(locale, "Wet-Lab Experimental Validation", "湿实验合成验证")}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t(
              locale,
              "To validate the practical antimicrobial potential of model-generated sequences, we selected 4 variants of the human cathelicidin LL-37 produced by AMP Forge for wet-lab synthesis and antimicrobial activity testing. All 4 synthesized variants demonstrated antimicrobial activity against target pathogens. Notably, Variant 1 showed significant improvements over the parent LL-37 in both antimicrobial potency and structural stability, confirming that the latent diffusion framework can generate functionally enhanced AMP candidates.",
              "为验证模型生成序列的实际抗菌潜力，我们选取了 AMP Forge 生成的 4 条人源抗菌肽 LL-37 变体进行湿实验合成与抗菌活性测试。全部 4 条合成变体均表现出对目标病原菌的抗菌活性。其中变体 1 在抗菌活性和结构稳定性方面均较母体 LL-37 有显著提升，证实了潜空间扩散框架能够生成功能增强的抗菌肽候选序列。"
            )}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-card rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t(locale, "Variants Tested", "验证变体数")}</p>
              <p className="text-2xl font-bold text-primary">4 / 4</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "All showed antimicrobial activity", "全部表现出抗菌活性")}</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">{t(locale, "Best Variant", "最优变体")}</p>
              <p className="text-2xl font-bold text-primary">{t(locale, "Variant 1", "变体 1")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t(locale, "Enhanced potency & stability vs. parent LL-37", "相比母体 LL-37 活性与稳定性均显著提升")}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg overflow-hidden border border-border bg-card">
              <img src={LL37_RESULT_IMG} alt="LL-37 colony count: T=0 vs T=3h" className="w-full" />
              <div className="px-4 py-3">
                <p className="text-sm font-medium mb-1">{t(locale, "Parent LL-37", "母体 LL-37")}</p>
                <p className="text-xs text-muted-foreground italic">
                  {t(locale, "Colony count comparison: T=0 (initial inoculation) vs. T=3h (after LL-37 treatment). Baseline antimicrobial activity of the parent peptide.", "菌落计数对比：T=0（初始接种）vs. T=3h（LL-37 处理后）。母体肽的基线抗菌活性。")}
                </p>
              </div>
            </div>
            <div className="rounded-lg overflow-hidden border border-border bg-card">
              <img src={LL37V1_RESULT_IMG} alt="LL-37 Variant 1 colony count: T=0 vs T=3h" className="w-full" />
              <div className="px-4 py-3">
                <p className="text-sm font-medium mb-1">{t(locale, "LL-37 Variant 1 (AMP Forge)", "LL-37 变体 1（AMP Forge 生成）")}</p>
                <p className="text-xs text-muted-foreground italic">
                  {t(locale, "Colony count comparison: T=0 vs. T=3h (after Variant 1 treatment). Variant 1 demonstrates significantly greater colony reduction compared to parent LL-37, indicating enhanced antimicrobial potency.", "菌落计数对比：T=0 vs. T=3h（变体 1 处理后）。变体 1 相比母体 LL-37 展现出显著更大的菌落减少量，表明抗菌活性增强。")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ─── Section 8: Future Directions (was Roadmap) ─── */
function FutureDirectionsSection({ locale }: { locale: Locale }) {
  const directions = [
    {
      title: { en: "Experimental Validation", zh: "实验验证" },
      desc: {
        en: "Collaborate with wet-lab partners to synthesize top-ranked generated AMPs and validate antimicrobial activity via MIC assays. Establish a feedback loop between computational predictions and experimental results to iteratively improve the model.",
        zh: "与湿实验合作方合成排名靠前的生成 AMP，通过 MIC 实验验证抗菌活性。建立计算预测与实验结果的反馈闭环，迭代改进模型。",
      },
      icon: <Target className="w-5 h-5 text-primary" />,
    },
    {
      title: { en: "Model Optimization", zh: "模型优化" },
      desc: {
        en: "Explore model compression techniques (knowledge distillation, quantization) for deployment efficiency. Investigate alternative diffusion schedules and conditional generation strategies to further improve the diversity–quality trade-off. Benchmark against additional baselines under unified evaluation protocols.",
        zh: "探索模型压缩技术（知识蒸馏、量化）以提升部署效率。研究替代扩散调度和条件生成策略，进一步改善多样性与质量的权衡。在统一评估协议下与更多基线方法进行对比。",
      },
      icon: <Cpu className="w-5 h-5 text-primary" />,
    },
    {
      title: { en: "Deployment & Extension", zh: "部署与扩展" },
      desc: {
        en: "Develop a web-based generation interface for interactive AMP design. Extend the framework to support additional peptide classes beyond AMPs (e.g., cell-penetrating peptides, anticancer peptides). Integrate structure prediction modules (ESMFold/AlphaFold) for joint sequence-structure optimization.",
        zh: "开发基于 Web 的生成界面，支持交互式 AMP 设计。将框架扩展到 AMP 以外的肽类（如细胞穿透肽、抗癌肽）。整合结构预测模块（ESMFold/AlphaFold），实现序列-结构联合优化。",
      },
      icon: <Layers className="w-5 h-5 text-primary" />,
    },
  ];

  return (
    <Section id="roadmap" withImageBg>
      <div className="container">
        <div className="flex items-start mb-10">
          <SectionNumber num="07." />
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">{t(locale, "Future Directions", "未来方向")}</h2>
            <p className="text-muted-foreground text-lg mt-3">{t(locale, "Planned research and engineering extensions", "计划中的研究与工程扩展")}</p>
            <div className="w-16 h-0.5 bg-primary mt-3" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {directions.map((d, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="bg-card rounded-lg border border-border p-6"
            >
              <div className="flex items-center gap-3 mb-3">
                {d.icon}
                <h3 className="font-semibold text-lg">{locale === "zh" ? d.title.zh : d.title.en}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {locale === "zh" ? d.desc.zh : d.desc.en}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ─── Section 9: References (expanded) ─── */
function ReferencesSection({ locale }: { locale: Locale }) {
  return (
    <Section id="references" withImageBg>
      <div className="container">
        <div className="flex items-start mb-10">
          <SectionNumber num="08." />
          <div>
            <h2 className="text-3xl md:text-4xl font-bold mb-2">{t(locale, "References", "参考文献")}</h2>
            <p className="text-muted-foreground text-lg mt-3">{t(locale, "Key works referenced in this research", "本研究引用的关键工作")}</p>
            <div className="w-16 h-0.5 bg-primary mt-3" />
          </div>
        </div>

        <div className="max-w-4xl space-y-4">
          {references.map((ref) => (
            <div key={ref.id} className="flex gap-4 text-sm">
              <span className="text-primary font-mono font-medium shrink-0">[{ref.id}]</span>
              <div>
                <span className="text-foreground">{ref.text}</span>
                {ref.doi && (
                  <a
                    href={`https://doi.org/${ref.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 text-primary hover:underline inline-flex items-center gap-0.5"
                  >
                    DOI <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function Footer({ locale }: { locale: Locale }) {
  return (
    <footer className="border-t border-border py-12 mt-8">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left">
            <p className="font-[family-name:var(--font-display)] text-lg font-semibold">AMP Forge</p>
            <p className="text-sm text-muted-foreground mt-1">{t(locale, "De novo antimicrobial peptide design via Transformer VAE + latent diffusion", "基于 Transformer VAE + 潜空间扩散的抗菌肽从头设计")}</p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="w-3.5 h-3.5" /> GitHub
            </a>
            <a
              href="#references"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5" /> {t(locale, "References", "参考文献")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>("en");

  return (
    <div className="min-h-screen" lang={locale === "zh" ? "zh-CN" : "en"}>
      <NavBar locale={locale} setLocale={setLocale} />
      <IGEMPointCloudSection locale={locale} />
      <AmpHeroSection locale={locale} />
      <SharedPeptideBackground>
        <OverviewSection locale={locale} />
        <LandscapeSection locale={locale} />
        <ArchitectureSection locale={locale} />
        <DataTrainingSection locale={locale} />
        <GenerationSection locale={locale} />
        <EvaluationSection locale={locale} />
        <FutureDirectionsSection locale={locale} />
        <ReferencesSection locale={locale} />
      </SharedPeptideBackground>
      <Footer locale={locale} />
    </div>
  );
}
