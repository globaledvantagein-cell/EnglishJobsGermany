// Shared, deterministic job-fit engine (no AI). Used by Today's Matches
// (skill-matcher) and Smart Match candidate selection (resume-matcher).
export { FIT_VERSION, buildCandidate, exclusionReason, scoreJobFit } from './jobFit.js';
export { jobBadges } from './jobBadges.js';
export { buildFeedbackProfile, feedbackMultiplier, isHidden, jobFeatures } from './feedbackModel.js';
export { canonicalize, expandSkill, isLanguageSkill, normalizeSkill, skillName, skillWeight, skillsInTitle } from './skillVocabulary.js';
