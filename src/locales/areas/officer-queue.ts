// S-009 review queue copy (TASK-027; FR-012; D3 SCREEN-009, COMP-035/036).
// Bangla parent default per FR-033.
//
// Every new key in the officer review-queue page and the per-row queue-list
// component lives here so waves can edit this file without touching the shared
// locales root (PHASE_3_PLAN.md §5). The shape mirrors the contract in
// src/contracts: OfficerQueueList only references these keys, plus
// matchReviewUnknownValue (shared, in the root) and mockLabel (shared).
export const officerQueueBn = {
  officerQueuePageTitle: "যাচাইয়ের জন্য অপেক্ষমাণ মিলসমূহ",
  officerQueueTitle: "যাচাইয়ের জন্য অপেক্ষমাণ মিলসমূহ",
  officerQueueIntro:
    "এখানে প্রতিটি নিখোঁজ রিপোর্টের সঙ্গে স্বয়ংক্রিয়ভাবে পাওয়া সম্ভাব্য মিলগুলোর তালিকা। প্রতিটি মিলে ক্লিক করে দুই রিপোর্ট পাশাপাশি দেখে সিদ্ধান্ত নিন।",
  officerQueueSyntheticNote: "সিনথেটিক তথ্য। কোনো আসল শিশুর তথ্য দেবেন না।",
  officerQueueEmptyTitle: "এখনো কোনো সম্ভাব্য মিল নেই",
  officerQueueEmptyBody: "নতুন রিপোর্ট এলে স্বয়ংক্রিয়ভাবে যাচাই হবে।",
  officerQueueListLabel: "যাচাইয়ের অপেক্ষমাণ মিলের তালিকা",
  officerQueueCandidateListLabel: "প্রস্তাবিত মিলের তালিকা",
  officerQueueMissingLabel: "নিখোঁজ রিপোর্ট",
  officerQueueFoundLabel: "পাওয়া গেছে",
  officerQueueCandidatesSuffix: "টি সম্ভাব্য মিল",
  officerQueueSimilarityLabel: "মিলের মাত্রা",
} as const;

export const officerQueueEn = {
  officerQueuePageTitle: "Awaiting review",
  officerQueueTitle: "Awaiting review",
  officerQueueIntro:
    "Here is every missing report alongside the automatically generated possible matches. Open a match to compare the two reports side by side and decide.",
  officerQueueSyntheticNote: "Synthetic data. Do not enter a real child's details.",
  officerQueueEmptyTitle: "No likely matches yet",
  officerQueueEmptyBody: "New reports are checked automatically.",
  officerQueueListLabel: "List of cases awaiting review",
  officerQueueCandidateListLabel: "List of proposed matches",
  officerQueueMissingLabel: "Missing report",
  officerQueueFoundLabel: "Found",
  officerQueueCandidatesSuffix: "candidate matches",
  officerQueueSimilarityLabel: "Similarity",
} as const;
