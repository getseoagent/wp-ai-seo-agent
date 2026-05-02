import { __, sprintf } from "../lib/i18n";

const LABELS: Record<string, string> = {
  "rank-math": "Rank Math",
  yoast: "Yoast",
  aioseo: "AIOSEO",
  seopress: "SEOPress",
};

const label = (slug: string): string => LABELS[slug] ?? slug;

type Props = {
  detected: string[];
};

export function MultiActiveBanner({ detected }: Props): JSX.Element | null {
  if (detected.length < 2) return null;

  const [primary, ...others] = detected;
  const primaryLabel = label(primary);
  const othersLabels = others.map(label);

  if (othersLabels.length === 1) {
    return (
      <div role="alert" className="seo-agent-multi-active-banner">
        {sprintf(
          /* translators: 1=primary plugin, 2=secondary plugin */
          __(
            "Detected multiple SEO plugins: %1$s, %2$s. The agent is writing through %1$s. %2$s metadata for the same posts will stay at its current values. Disable the unused plugin to avoid drift.",
          ),
          primaryLabel,
          othersLabels[0],
        )}
      </div>
    );
  }

  return (
    <div role="alert" className="seo-agent-multi-active-banner">
      {sprintf(
        /* translators: 1=primary plugin, 2=comma-joined other plugins */
        __(
          "Detected multiple SEO plugins: %1$s, plus %2$s. The agent is writing through %1$s only. Metadata in the others will diverge. Disable the unused plugins.",
        ),
        primaryLabel,
        othersLabels.join(", "),
      )}
    </div>
  );
}
