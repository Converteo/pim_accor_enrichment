import { useFormatter, useLocale, useTranslations } from "next-intl";
import { formatScore, statusTone } from "@/domain/rules";
import type { MatchItem } from "@/domain/types";
import { codeLabel, countryName, sourceLabel } from "./labels";
import styles from "./MatchDetailView.module.css";

interface MatchDetailViewProps {
  match: MatchItem;
}

/** PIM record and scraped page side by side, with the deterministic check and the judge agent's opinion. */
export function MatchDetailView({ match }: MatchDetailViewProps) {
  const t = useTranslations("matches");
  const tRoot = useTranslations();
  const locale = useLocale();
  const format = useFormatter();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const decision = match.status === "human_approved" || match.status === "human_rejected" ? match.status : null;

  const pim = [
    [t("name"), match.pim.name],
    [t("city"), match.pim.city],
    [t("country"), match.pim.country],
    [t("brand"), match.pim.brand],
    [t("address"), match.pim.address],
  ] as const;
  const page = [
    [t("scrapedName"), match.page.scrapedName],
    [t("pageName"), match.page.pageName],
    [t("country"), countryName(locale, match.page.country)],
  ] as const;

  return (
    <>
      {decision && match.lastDecision ? (
        <section className={styles.opinion}>
          <h3 className={styles.sideTitle}>{t("decision")}</h3>
          <p className={styles.text}>
            <span className={`status-pill pill-${statusTone(decision)}`}>{t(`decisions.${decision}`)}</span>{" "}
            {tRoot("detail.decidedBy", {
              author: match.lastDecision.author || "—",
              date: format.dateTime(new Date(match.lastDecision.decidedAt), {
                dateStyle: "short",
                timeStyle: "short",
                timeZone,
              }),
            })}
          </p>
          {match.lastDecision.comment ? <p className={styles.quote}>{match.lastDecision.comment}</p> : null}
        </section>
      ) : null}
      <div className={styles.sides}>
        <section className={styles.side}>
          <h3 className={styles.sideTitle}>{t("pim")}</h3>
          <dl className={styles.fields}>
            {pim.map(([label, text]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{text ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={styles.side}>
          <h3 className={styles.sideTitle}>
            {t("page")} · {sourceLabel(tRoot, match.source)}
          </h3>
          <dl className={styles.fields}>
            {page.map(([label, text]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{text ?? "—"}</dd>
              </div>
            ))}
          </dl>
          {match.page.url ? (
            <a className={styles.link} href={match.page.url} target="_blank" rel="noopener noreferrer">
              {t("openPage")}
            </a>
          ) : null}
        </section>
      </div>

      <section className={styles.opinion}>
        <h3 className={styles.sideTitle}>{t("judge")}</h3>
        <div className={styles.score}>
          <span className="score-pill pill-review">
            {formatScore(match.score)}
            <small>/100</small>
          </span>
          {match.verdict ? (
            <span className={styles.badge}>{codeLabel(tRoot, "matches.judgeVerdicts", match.verdict)}</span>
          ) : null}
          {match.confidence ? (
            <span className={styles.badge}>
              {tRoot("value.confidence", { level: codeLabel(tRoot, "value.confidenceLevel", match.confidence) })}
            </span>
          ) : null}
          {match.judgeReason ? (
            <span className={styles.badge}>{codeLabel(tRoot, "matches.reasons", match.judgeReason)}</span>
          ) : null}
        </div>
        {match.justification ? <p className={styles.quote}>{match.justification}</p> : null}
      </section>

      {match.preVerdict || match.preReason ? (
        <section className={styles.opinion}>
          <h3 className={styles.sideTitle}>{t("check")}</h3>
          <p className={styles.text}>
            {match.preVerdict ? (
              <span className={styles.badge}>{codeLabel(tRoot, "matches.verdicts", match.preVerdict)}</span>
            ) : null}{" "}
            {match.preReason}
          </p>
        </section>
      ) : null}

      <p className={styles.delay}>{t("delay")}</p>
    </>
  );
}
