import { loadFiches } from "../src/data/source";
import {
  rejectFiche,
  statusFor,
  summarize,
  validateFiche,
} from "../src/domain/rules";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const fiches = loadFiches();
const summary = summarize(fiches);

assert(fiches.length === 14, `expected 14 fiches, got ${fiches.length}`);
assert(summary.counts.valide === 3, `valide ${summary.counts.valide}`);
assert(summary.counts.haute === 5, `haute ${summary.counts.haute}`);
assert(summary.counts.revoir === 4, `revoir ${summary.counts.revoir}`);
assert(summary.counts.echec === 2, `echec ${summary.counts.echec}`);
assert(summary.autoPercent === 57, `auto ${summary.autoPercent}`);
assert(summary.segments.map((segment) => segment.width).join(",") === "21.43%,35.71%,28.57%,14.29%", "widths");

assert(statusFor(1) === "valide", "statusFor(1)");
assert(statusFor(0.8) === "revoir", "statusFor(0.8)");
assert(statusFor(0.5) === "echec", "statusFor(0.5)");
assert(statusFor(0.98) === "haute", "statusFor(0.98)");

const fiche6 = fiches.find((fiche) => fiche.id === 6);
assert(fiche6 !== undefined, "fiche 6");
if (fiche6) {
  const validated = validateFiche(fiche6);
  assert(validated.score === 1, "validate score");
  assert(validated.status === "valide", "validate status");
  assert(
    validated.attrs.every((attr, index) => attr.score === fiche6.attrs[index]?.score),
    "validate keeps attr scores",
  );
  const rejectedAfter = rejectFiche(validated);
  assert(rejectedAfter.score === 1, "validate then reject keeps score 1");
  assert(rejectedAfter.status === "echec", "validate then reject is echec");
  const afterValidate6 = summarize(
    fiches.map((fiche) => (fiche.id === 6 ? validated : fiche)),
  );
  assert(afterValidate6.counts.valide === 4, "validate 6 valide");
  assert(afterValidate6.counts.revoir === 3, "validate 6 revoir");
  assert(afterValidate6.autoPercent === 64, "validate 6 auto");
}

const fiche5 = fiches.find((fiche) => fiche.id === 5);
assert(fiche5 !== undefined, "fiche 5");
if (fiche5) {
  const rejected = rejectFiche(fiche5);
  assert(rejected.status === "echec", "reject status");
  assert(rejected.score === fiche5.score, "reject keeps score");
  assert(rejected.score === 0.95, "fiche 5 score");
  const afterReject5 = summarize(
    fiches.map((fiche) => (fiche.id === 5 ? rejected : fiche)),
  );
  assert(afterReject5.counts.haute === 4, "reject 5 haute");
  assert(afterReject5.counts.echec === 3, "reject 5 echec");
  assert(afterReject5.autoPercent === 50, "reject 5 auto");
}

const again = loadFiches();
const first = fiches[0];
const second = again[0];
assert(first !== undefined && second !== undefined, "fiche 1 present");
if (first && second && first.attrs[0] && second.attrs[0]) {
  first.score = 0;
  first.attrs[0].accepted = true;
  first.attrs[0].proposed = "mutated";
  assert(second.score === 1, "loadFiches returns an independent score");
  assert(second.attrs[0].accepted === null, "loadFiches returns neutral attributes");
  assert(second.attrs[0].proposed !== "mutated", "loadFiches deep-copies attributes");
}
assert(!("statusInitial" in (fiches[1] ?? {})), "statusInitial dropped");
assert(!("statusInitial" in (fiches[1]?.attrs[0] ?? {})), "attr statusInitial dropped");

const contact = fiches.find((fiche) => fiche.id === 9)?.attrs[4];
assert(contact?.proposed === "+39 02 6749 9, h0319@accor.com", "fiche 9 comma");

console.log("check-rules: ok");
