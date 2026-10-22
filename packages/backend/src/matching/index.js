// Deterministic job-fit engine (no AI). Smart Match (resume-matcher) uses it
// to choose the candidates the AI scores.
export { FIT_VERSION, buildCandidate, exclusionReason, scoreJobFit } from './jobFit.js';
export { jobBadges } from './jobBadges.js';
export { buildFeedbackProfile, feedbackMultiplier, isHidden, jobFeatures } from './feedbackModel.js';
export { canonicalize, expandSkill, isLanguageSkill, normalizeSkill, skillName, skillWeight, skillsInTitle } from './skillVocabulary.js';
