"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { brandOptions, loadFiches, sourceOptions } from "@/data/source";
import {
  clearSelection,
  headerChecked,
  rejectFiche,
  rejectFicheInBatch,
  setRowSelected,
  setVisibleSelected,
  summarize,
  toggleAttribute,
  validateFiche,
  validateFicheInBatch,
  visibleFiches,
} from "@/domain/rules";
import type { Fiche, Filters, TabKey } from "@/domain/types";
import { BulkBar } from "./BulkBar";
import { Drawer } from "./Drawer";
import { FicheTable } from "./FicheTable";
import { Toolbar } from "./Toolbar";
import { Topbar } from "./Topbar";
import styles from "./ValidationScreen.module.css";

const EMPTY_FILTERS: Filters = {
  search: "",
  brand: "",
  source: "",
  tab: "all",
};

export function ValidationScreen() {
  const t = useTranslations();
  const [fiches, setFiches] = useState<Fiche[]>(() => loadFiches());
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [openId, setOpenId] = useState<number | null>(null);
  const [displayedId, setDisplayedId] = useState<number | null>(null);

  const visible = visibleFiches(fiches, filters);
  const summary = summarize(fiches);
  const selectedCount = fiches.filter((fiche) => fiche.selected).length;
  const allVisibleChecked = headerChecked(fiches, filters);
  const displayed = fiches.find((fiche) => fiche.id === displayedId) ?? null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && openId !== null) {
        setOpenId(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openId]);

  function onSearch(value: string) {
    setFilters((current) => ({ ...current, search: value }));
  }

  function onBrand(value: string) {
    setFilters((current) => ({ ...current, brand: value }));
  }

  function onSource(value: string) {
    setFilters((current) => ({ ...current, source: value }));
  }

  function onTab(tab: TabKey) {
    setFilters((current) => ({ ...current, tab }));
  }

  function onToggleRow(id: number, selected: boolean) {
    setFiches((current) => setRowSelected(current, id, selected));
  }

  function onToggleVisible(selected: boolean) {
    setFiches((current) => setVisibleSelected(current, filters, selected));
  }

  function onCancelSelection() {
    setFiches((current) => clearSelection(current));
  }

  function onOpen(id: number) {
    setOpenId(id);
    setDisplayedId(id);
  }

  function onClose() {
    setOpenId(null);
  }

  function onToggleAttr(index: number, value: boolean) {
    if (openId === null) return;
    setFiches((current) =>
      current.map((fiche) =>
        fiche.id === openId ? toggleAttribute(fiche, index, value) : fiche,
      ),
    );
  }

  function onValidateOne() {
    if (openId === null) return;
    setFiches((current) =>
      current.map((fiche) =>
        fiche.id === openId ? validateFiche(fiche) : fiche,
      ),
    );
    setOpenId(null);
  }

  function onRejectOne() {
    if (openId === null) return;
    setFiches((current) =>
      current.map((fiche) => (fiche.id === openId ? rejectFiche(fiche) : fiche)),
    );
    setOpenId(null);
  }

  function onValidateSelected() {
    setFiches((current) =>
      current.map((fiche) =>
        fiche.selected ? validateFicheInBatch(fiche) : fiche,
      ),
    );
  }

  function onRejectSelected() {
    setFiches((current) =>
      current.map((fiche) =>
        fiche.selected ? rejectFicheInBatch(fiche) : fiche,
      ),
    );
  }

  return (
    <>
      <Topbar
        summary={{
          total: summary.total,
          autoPercent: summary.autoPercent,
          reviewCount: summary.reviewCount,
          failureCount: summary.failureCount,
        }}
        segments={summary.segments}
      />
      <main className={styles.app}>
        <Toolbar
          filters={filters}
          counts={summary.tabCounts}
          brandOptions={brandOptions}
          sourceOptions={sourceOptions}
          onSearch={onSearch}
          onBrand={onBrand}
          onSource={onSource}
          onTab={onTab}
        />
        <FicheTable
          rows={visible}
          headerChecked={allVisibleChecked}
          onToggleRow={onToggleRow}
          onToggleVisible={onToggleVisible}
          onOpen={onOpen}
        />
        <p className={styles.empty} hidden={visible.length > 0}>
          {t("empty")}
        </p>
      </main>
      <footer className={styles.footer}>
        <p className={styles.note}>{t("note")}</p>
      </footer>
      <Drawer
        fiche={displayed}
        open={openId !== null}
        onClose={onClose}
        onToggleAttr={onToggleAttr}
        onValidate={onValidateOne}
        onReject={onRejectOne}
      />
      <BulkBar
        count={selectedCount}
        onCancel={onCancelSelection}
        onReject={onRejectSelected}
        onValidate={onValidateSelected}
      />
    </>
  );
}
