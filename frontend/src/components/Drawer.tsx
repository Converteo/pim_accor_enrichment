import { useTranslations } from "next-intl";
import { formatScore, statusFor } from "@/domain/rules";
import type { Fiche } from "@/domain/types";
import { AttributeCard } from "./AttributeCard";
import styles from "./Drawer.module.css";

const ATTRIBUTE_KEYS = {
  "Adresse & géolocalisation": "address",
  "Équipements & services": "amenities",
  "Description commerciale": "description",
  "Classification (catégorie)": "classification",
  "Coordonnées de contact": "contact",
  "Photo de couverture": "photo",
} as const;

type AttributeMessageKey = (typeof ATTRIBUTE_KEYS)[keyof typeof ATTRIBUTE_KEYS];

interface DrawerProps {
  fiche: Fiche | null;
  open: boolean;
  onClose: () => void;
  onToggleAttr: (index: number, value: boolean) => void;
  onValidate: () => void;
  onReject: () => void;
}

function attributeLabel(
  label: string,
  translate: (key: `attributes.${AttributeMessageKey}`) => string,
): string {
  const key = ATTRIBUTE_KEYS[label as keyof typeof ATTRIBUTE_KEYS];
  return key ? translate(`attributes.${key}`) : label;
}

export function Drawer({
  fiche,
  open,
  onClose,
  onToggleAttr,
  onValidate,
  onReject,
}: DrawerProps) {
  const t = useTranslations();

  return (
    <div
      className={open ? `${styles.drawer} ${styles.open}` : styles.drawer}
      aria-hidden={!open}
    >
      <div className={styles.scrim} onClick={onClose} />
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawerTitle"
      >
        <button
          type="button"
          className={styles.close}
          aria-label={t("drawer.close")}
          onClick={onClose}
        >
          ✕
        </button>
        <div className={styles.header}>
          <p className={styles.eyebrow}>
            {fiche
              ? t("drawer.eyebrow", {
                  brand: fiche.brand,
                  city: fiche.city,
                  source: fiche.source,
                })
              : ""}
          </p>
          <h2 id="drawerTitle" className={styles.heading}>
            {fiche?.name ?? ""}
          </h2>
          {fiche ? (
            <div className={styles.meta}>
              <span className={`score-pill pill-${fiche.status}`}>
                {t("drawer.score", { score: formatScore(fiche.score) })}
              </span>
              <span className={`status-pill pill-${fiche.status}`}>
                <i className={`dot dot-${fiche.status}`} />
                {t(`status.${fiche.status}`)}
              </span>
            </div>
          ) : null}
        </div>
        <div className={styles.body}>
          {fiche?.attrs.map((attr, index) => (
            <AttributeCard
              key={`${fiche.id}-${attr.label}`}
              label={attributeLabel(attr.label, (key) => t(key))}
              src={attr.src}
              current={attr.current}
              proposed={attr.proposed}
              scoreLabel={formatScore(attr.score)}
              barStatus={statusFor(attr.score)}
              barWidth={`${attr.score * 100}%`}
              accepted={attr.accepted}
              onAccept={() => onToggleAttr(index, true)}
              onReject={() => onToggleAttr(index, false)}
            />
          ))}
        </div>
        <div className={styles.footer}>
          <button type="button" className="btn btn-danger" onClick={onReject}>
            {t("drawer.reject")}
          </button>
          <button type="button" className="btn btn-primary" onClick={onValidate}>
            {t("drawer.validate")}
          </button>
        </div>
      </div>
    </div>
  );
}
