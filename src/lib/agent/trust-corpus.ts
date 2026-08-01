/**
 * Brand trust corpus — the documents ingested into Senso.
 *
 * BE CLEAR ABOUT WHAT THIS IS. The brands in our catalog (BulkNutrition,
 * PeakForm, ApexLabs, …) are fictional, so no real NSF, Informed Sport or FDA
 * record exists for them. These documents are authored for the demo and say so
 * on their face.
 *
 * What is *not* faked: Senso genuinely ingests them, genuinely retrieves against
 * them, and genuinely returns the cited passage that drives each trust verdict.
 * The retrieval is real; the corpus is seeded. Point `ingest-trust` at real NSF
 * Certified for Sport listings, Informed Sport's database, and FDA warning
 * letters and nothing downstream changes.
 *
 * The certification conventions referenced are real:
 *  - NSF Certified for Sport: per-lot testing against a banned-substance list.
 *  - Informed Sport: every batch tested before release.
 *  - cGMP: FDA manufacturing-practice regulations.
 *  - FDA warning letters / recalls: public enforcement record.
 */

export interface TrustDocument {
  brand: string;
  title: string;
  content: string;
}

const DISCLAIMER =
  'NOTE: MacroStack demonstration corpus. These brands are fictional and these ' +
  'records are illustrative, not real certification data.';

export const TRUST_CORPUS: TrustDocument[] = [
  {
    brand: 'BulkNutrition',
    title: 'BulkNutrition — third-party verification record',
    content: `${DISCLAIMER}

Brand: BulkNutrition
Third-party certification: NSF Certified for Sport — active, every lot tested.
Informed Sport: enrolled, batch testing published per lot.
Manufacturing: cGMP-compliant facility, audited annually.
FDA enforcement history: no warning letters, no recalls on record.
Label accuracy: independent assay results match the declared amounts within 2%.
Proprietary blends: none. All ingredient amounts individually disclosed.

Assessment: Strong. Fully disclosed dosing, per-lot third-party testing, and a
clean enforcement record. Suitable for tested athletes.`,
  },
  {
    brand: 'PeakForm',
    title: 'PeakForm — third-party verification record',
    content: `${DISCLAIMER}

Brand: PeakForm
Third-party certification: Informed Sport — active, batch tested.
NSF Certified for Sport: not enrolled.
Manufacturing: cGMP-compliant facility.
FDA enforcement history: no warning letters, no recalls on record.
Label accuracy: independent assay results match declared amounts within 4%.
Proprietary blends: none in single-ingredient powders.

Assessment: Good. Batch tested and cleanly labelled, though not NSF certified.
Reliable for general use.`,
  },
  {
    brand: 'CleanWhey',
    title: 'CleanWhey — third-party verification record',
    content: `${DISCLAIMER}

Brand: CleanWhey
Third-party certification: NSF Certified for Sport — active.
Informed Sport: enrolled.
Manufacturing: cGMP-compliant facility.
FDA enforcement history: clean.
Label accuracy: protein content verified by nitrogen and amino acid profiling;
no evidence of amino spiking.
Proprietary blends: none.

Assessment: Strong. Protein claims verified by amino acid profiling rather than
nitrogen content alone, which is the meaningful test.`,
  },
  {
    brand: 'MassLine',
    title: 'MassLine — third-party verification record',
    content: `${DISCLAIMER}

Brand: MassLine
Third-party certification: none. Not NSF certified, not Informed Sport enrolled.
Manufacturing: cGMP-compliant facility.
FDA enforcement history: no formal action.
Label accuracy: CONCERN — independent amino acid profiling indicates added
glycine and taurine inflate nitrogen-derived protein figures. Effective complete
protein is materially below the declared amount. This practice is known as amino
spiking.
Proprietary blends: none, but the excipient list is unusually long.

Assessment: Weak. Amino spiking means the declared protein number overstates
usable protein. Treat the label figure as an upper bound.`,
  },
  {
    brand: 'ApexLabs',
    title: 'ApexLabs — third-party verification record',
    content: `${DISCLAIMER}

Brand: ApexLabs
Third-party certification: none.
Manufacturing: contract manufacturer, no published audit.
FDA enforcement history: CONCERN — warning letter on record citing unsubstantiated
structure/function claims and inadequate batch records.
Label accuracy: CONCERN — proprietary blends conceal per-ingredient dosing. Where
independently assayed, the active ingredient sat well below the clinically
studied dose.
Proprietary blends: yes, across the product line. Fillers such as maltodextrin
and dextrose are listed ahead of active ingredients, indicating they dominate by
weight.

Assessment: Poor. Proprietary blends plus an FDA warning letter. Cost per gram of
actual active ingredient is far worse than sticker price implies.`,
  },
  {
    brand: 'VitalRoot',
    title: 'VitalRoot — third-party verification record',
    content: `${DISCLAIMER}

Brand: VitalRoot
Third-party certification: none.
Manufacturing: cGMP-compliant facility.
FDA enforcement history: no formal action.
Label accuracy: MIXED. Single-ingredient products are accurately labelled. Blend
products conceal per-ingredient dosing, and the disclosed blend total implies the
headline ingredient is below its clinically studied dose.
Proprietary blends: yes, in the "Pump Matrix" line.

Assessment: Mixed. Straightforward products are fine; the blends hide dosing and
should be treated with caution.`,
  },
  {
    brand: 'HydraSalt',
    title: 'HydraSalt — third-party verification record',
    content: `${DISCLAIMER}

Brand: HydraSalt
Third-party certification: Informed Sport — active.
Manufacturing: cGMP-compliant facility.
FDA enforcement history: clean.
Label accuracy: electrolyte content independently verified; declared amounts
confirmed within 3%.
Proprietary blends: none. Each mineral salt disclosed separately.
Added sugar: none.

Assessment: Strong. Fully disclosed mineral-by-mineral dosing and no added sugar.`,
  },
];

/**
 * How the certification landscape should be interpreted. Ingested alongside the
 * per-brand records so retrieval can ground a verdict even for a brand with no
 * record of its own.
 */
export const TRUST_METHODOLOGY: TrustDocument = {
  brand: '_methodology',
  title: 'Supplement trust signals — how to read third-party verification',
  content: `${DISCLAIMER}

How to judge a supplement brand's trustworthiness:

STRONG SIGNALS
- NSF Certified for Sport: every lot screened against a banned-substance list.
  The strictest widely recognised mark.
- Informed Sport: every batch tested before release.
- Independent assay results matching declared amounts.
- Full per-ingredient disclosure with no proprietary blends.

WARNING SIGNALS
- Proprietary blends: a single blend total conceals how much of each ingredient
  is present. Legal, but it hides underdosing.
- Amino spiking: adding cheap free-form amino acids such as glycine or taurine
  inflates nitrogen-derived protein figures without adding usable protein.
- Fillers listed before actives: ingredients appear in descending order by
  weight, so maltodextrin or dextrose in first position means filler dominates.
- FDA warning letters or recalls.
- Doses below the clinically studied threshold, for example creatine below 3g/day
  or beta-alanine below 3.2g/day.

A certification mark is evidence about process, not a guarantee of value. Weigh
it alongside cost per gram of actual active ingredient.`,
};

export const ALL_TRUST_DOCUMENTS: TrustDocument[] = [TRUST_METHODOLOGY, ...TRUST_CORPUS];
