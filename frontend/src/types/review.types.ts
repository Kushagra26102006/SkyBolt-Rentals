export type ReviewStatus = 'PUBLISHED' | 'PENDING' | 'HIDDEN' | 'REJECTED' | 'DELETED';
export type ReviewVerificationStatus = 'VERIFIED';
export type ReviewModerationStatus = 'APPROVED' | 'PENDING' | 'FLAGGED' | 'REJECTED';
export type ReportReason = 'SPAM' | 'ABUSIVE' | 'INAPPROPRIATE' | 'FRAUDULENT' | 'IRRELEVANT' | 'OTHER';
export type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';
export type ReviewSortOption = 'newest' | 'highest' | 'lowest' | 'most_helpful';

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
}
