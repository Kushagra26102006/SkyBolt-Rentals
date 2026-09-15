export const ReviewStatus = {
  PUBLISHED: 'PUBLISHED',
  PENDING: 'PENDING',
  HIDDEN: 'HIDDEN',
  REJECTED: 'REJECTED',
  DELETED: 'DELETED'
} as const;
export type ReviewStatus = typeof ReviewStatus[keyof typeof ReviewStatus];

export const ReviewVerificationStatus = {
  VERIFIED: 'VERIFIED'
} as const;
export type ReviewVerificationStatus = typeof ReviewVerificationStatus[keyof typeof ReviewVerificationStatus];

export const ReviewModerationStatus = {
  APPROVED: 'APPROVED',
  PENDING: 'PENDING',
  FLAGGED: 'FLAGGED',
  REJECTED: 'REJECTED'
} as const;
export type ReviewModerationStatus = typeof ReviewModerationStatus[keyof typeof ReviewModerationStatus];

export const ReportReason = {
  SPAM: 'SPAM',
  ABUSIVE: 'ABUSIVE',
  INAPPROPRIATE: 'INAPPROPRIATE',
  FRAUDULENT: 'FRAUDULENT',
  IRRELEVANT: 'IRRELEVANT',
  OTHER: 'OTHER'
} as const;
export type ReportReason = typeof ReportReason[keyof typeof ReportReason];

export const ReportStatus = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  DISMISSED: 'DISMISSED'
} as const;
export type ReportStatus = typeof ReportStatus[keyof typeof ReportStatus];

export const ReviewSortOption = {
  NEWEST: 'newest',
  HIGHEST: 'highest',
  LOWEST: 'lowest',
  MOST_HELPFUL: 'most_helpful'
} as const;
export type ReviewSortOption = typeof ReviewSortOption[keyof typeof ReviewSortOption];

export interface ReviewAuthorDTO {
  id: string;
  name: string;
  avatar?: string;
}

export interface ReviewDTO {
  id: string;
  userId: string;
  bookingId: string;
  vehicleId: string;
  rating: number;
  title: string;
  comment: string;
  status: ReviewStatus;
  verificationStatus: ReviewVerificationStatus;
  helpfulCount: number;
  author: ReviewAuthorDTO;
  publishedAt?: string;
  editedAt?: string;
  createdAt: string;
  updatedAt: string;
  userHasVotedHelpful?: boolean;
  userVotedHelpful?: boolean;
}

export interface AdminReviewDTO extends ReviewDTO {
  moderationStatus: ReviewModerationStatus;
  moderatedBy?: string;
  moderatedAt?: string;
  rejectionReason?: string;
  reportedCount: number;
  isDeleted: boolean;
  deletedAt?: string;
}

export interface ReviewReportDTO {
  id: string;
  reviewId: string;
  reportedBy: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleReviewSummaryDTO {
  averageRating: number;
  totalReviews: number;
  verifiedCount: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  ratingPercentages: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface ReviewEligibilityResult {
  eligible: boolean;
  code?: string;
  reason?: string;
  bookingId?: string;
  vehicleId?: string;
  completedAt?: string;
  existingReviewId?: string;
}

export interface CreateReviewInput {
  rating: number;
  title: string;
  comment: string;
}

export interface UpdateReviewInput {
  rating?: number;
  title?: string;
  comment?: string;
}

export interface CreateReportInput {
  reason: ReportReason;
  description?: string;
}

export interface ModerateReviewInput {
  status: ReviewStatus;
  moderationStatus?: ReviewModerationStatus;
  rejectionReason?: string;
}

export interface ResolveReportInput {
  status: ReportStatus;
  resolutionNotes?: string;
  hideReview?: boolean;
  reviewAction?: 'NONE' | 'HIDE_REVIEW' | 'REJECT_REVIEW';
}

export interface ReviewQueryOptions {
  page?: number;
  limit?: number;
  sort?: ReviewSortOption;
  rating?: number;
  status?: ReviewStatus;
  vehicleId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
}
