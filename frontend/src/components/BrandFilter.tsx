import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { textMatches } from "@/domain/rules";
import styles from "./BrandFilter.module.css";

interface BrandFilterProps {
  brands: readonly string[];
  /** "" = all brands. */
  value: string;
  onChange: (brand: string) => void;
  className: string;
}

/** Brand filter with a search box (PIM-58): combobox, filtered as the reviewer types, usable with the keyboard alone. */
export function BrandFilter({ brands, value, onChange, className }: BrandFilterProps) {
  const t = useTranslations("filters");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // "" first: « Toutes les marques » resets the filter.
  const options = ["", ...brands.filter((brand) => textMatches(brand, query))];

  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, id]);

  function show() {
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  function choose(brand: string) {
    close();
    if (brand !== value) onChange(brand);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else setActive((index) => Math.min(options.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  }

  return (
    <span className={styles.combo}>
      <input
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        autoComplete="off"
        value={open ? query : value}
        placeholder={value || t("allBrands")}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onClick={() => (open ? undefined : show())}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul className={styles.list} id={`${id}-list`} role="listbox" aria-label={t("brandLabel")}>
          {options.map((brand, index) => (
            <li
              key={brand}
              id={`${id}-${index}`}
              role="option"
              aria-selected={brand === value}
              className={index === active ? `${styles.option} ${styles.active}` : styles.option}
              // Keeps the focus in the box: a blur would close the list before the click.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(brand)}
            >
              {brand || t("allBrands")}
            </li>
          ))}
          {options.length === 1 ? <li className={styles.none}>{t("noBrand")}</li> : null}
        </ul>
      ) : null}
    </span>
  );
}
