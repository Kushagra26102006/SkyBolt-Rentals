import { Types } from 'mongoose';
type FilterQuery<_T = any> = Record<string, any>;
import { ReviewModel, IReviewDoc } from '../models/review.model.js';
import { ReviewReportModel, IReviewReportDoc } from '../models/review-report.model.js';
import { ReviewHelpfulVoteModel } from '../models/review-helpful-vote.model.js';
import {
  ReviewStatus,
  ReviewModerationStatus,
  ReportStatus,
  ReportReason,
  ReviewQueryOptions,
  VehicleReviewSummaryDTO,
  ReviewDTO,
  AdminReviewDTO,
  ReviewAuthorDTO
} from './review.types.js';

export class ReviewRepository {
  /**
   * Insert new review document.
   */
  public async createReview(data: Partial<IReviewDoc>): Promise<IReviewDoc> {
    return await ReviewModel.create(data);
  }

  /**
   * Find single review by ID.
   */
  public async findReviewById(id: string): Promise<IReviewDoc | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return (await ReviewModel.findOne({ _id: new Types.ObjectId(id) })
      .populate('userId', 'name avatar')
      .exec()) as IReviewDoc | null;
  }

  /**
   * Find review by booking and user.
   */
  public async findReviewByBookingAndUser(
    bookingId: string,
    userId: string
  ): Promise<IReviewDoc | null> {
    if (!Types.ObjectId.isValid(bookingId) || !Types.ObjectId.isValid(userId)) return null;
    return await ReviewModel.findOne({
      bookingId: new Types.ObjectId(bookingId),
      userId: new Types.ObjectId(userId),
      isDeleted: false
    }).exec();
  }

  /**
   * Public: Query paginated reviews for a specific vehicle with safe author projection.
   */
  public async findPublicVehicleReviews(
    vehicleId: string,
    options: ReviewQueryOptions = {},
    currentUserId?: string
  ): Promise<{
    reviews: ReviewDTO[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 10));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<IReviewDoc> = {
      vehicleId: Types.ObjectId.isValid(vehicleId) ? new Types.ObjectId(vehicleId) : vehicleId,
      status: ReviewStatus.PUBLISHED,
      isDeleted: false
    };

    if (options.rating && options.rating >= 1 && options.rating <= 5) {
      filter.rating = options.rating;
    }

    let sortObj: Record<string, 1 | -1> = { publishedAt: -1 };
    switch (options.sort) {
      case 'highest':
        sortObj = { rating: -1, publishedAt: -1 };
        break;
      case 'lowest':
        sortObj = { rating: 1, publishedAt: -1 };
        break;
      case 'most_helpful':
        sortObj = { helpfulCount: -1, publishedAt: -1 };
        break;
      case 'newest':
      default:
        sortObj = { publishedAt: -1 };
        break;
    }

    const [docs, total] = await Promise.all([
      ReviewModel.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .populate<{ userId: { _id: Types.ObjectId; name: string; avatar?: string } }>('userId', 'name avatar')
        .exec(),
      ReviewModel.countDocuments(filter).exec()
    ]);

    // Check helpful votes for current authenticated user if provided
    let userVotedIds = new Set<string>();
    if (currentUserId && Types.ObjectId.isValid(currentUserId) && docs.length > 0) {
      const reviewIds = docs.map((d) => d._id);
      const votes = await ReviewHelpfulVoteModel.find({
        userId: new Types.ObjectId(currentUserId),
        reviewId: { $in: reviewIds }
      }).exec();
      userVotedIds = new Set(votes.map((v) => v.reviewId.toString()));
    }

    const reviews: ReviewDTO[] = docs.map((doc) => {
      const userRef = doc.userId as any;
      const author: ReviewAuthorDTO = {
        id: userRef?._id ? userRef._id.toString() : String(doc.userId),
        name: userRef?.name ? userRef.name : 'Verified Customer',
        avatar: userRef?.avatar
      };
      const userHasVotedHelpful = userVotedIds.has(doc._id.toString());
      return doc.toSafeDTO(author, userHasVotedHelpful);
    });

    return { reviews, total, page, limit };
  }

  /**
   * Computes authoritative rating aggregation pipeline over published reviews for a vehicle.
   */
  public async aggregateVehicleReviewSummary(vehicleId: string): Promise<VehicleReviewSummaryDTO> {
    const vId = Types.ObjectId.isValid(vehicleId) ? new Types.ObjectId(vehicleId) : vehicleId;

    const pipeline = [
      {
        $match: {
          vehicleId: vId,
          status: ReviewStatus.PUBLISHED,
          isDeleted: false
        }
      },
      {
        $group: {
          _id: null,
          totalReviews: { $sum: 1 },
          averageRating: { $avg: '$rating' },
          verifiedCount: {
            $sum: {
              $cond: [{ $eq: ['$verificationStatus', 'VERIFIED'] }, 1, 0]
            }
          },
          star5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          star4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
          star3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
          star2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
          star1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } }
        }
      }
    ];

    const result = await ReviewModel.aggregate(pipeline).exec();

    if (!result || result.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        verifiedCount: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        ratingPercentages: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      };
    }

    const row = result[0];
    const total = row.totalReviews || 0;
    const avg = total > 0 ? Math.round((row.averageRating || 0) * 10) / 10 : 0;

    const star1 = row.star1 || 0;
    const star2 = row.star2 || 0;
    const star3 = row.star3 || 0;
    const star4 = row.star4 || 0;
    const star5 = row.star5 || 0;

    const pct = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);

    return {
      averageRating: avg,
      totalReviews: total,
      verifiedCount: row.verifiedCount || 0,
      ratingDistribution: {
        1: star1,
        2: star2,
        3: star3,
        4: star4,
        5: star5
      },
      ratingPercentages: {
        1: pct(star1),
        2: pct(star2),
        3: pct(star3),
        4: pct(star4),
        5: pct(star5)
      }
    };
  }

  /**
   * Customer: View personal review history with pagination.
   */
  public async findCustomerReviews(
    userId: string,
    options: ReviewQueryOptions = {}
  ): Promise<{ reviews: ReviewDTO[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 10));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<IReviewDoc> = {
      userId: new Types.ObjectId(userId),
      isDeleted: false
    };

    const [docs, total] = await Promise.all([
      ReviewModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate<{ userId: { name: string; avatar?: string } }>('userId', 'name avatar')
        .exec(),
      ReviewModel.countDocuments(filter).exec()
    ]);

    const reviews = docs.map((doc) => {
      const userRef = doc.userId as any;
      const author: ReviewAuthorDTO = {
        id: userId,
        name: userRef?.name || 'Verified Customer',
        avatar: userRef?.avatar
      };
      return doc.toSafeDTO(author, false);
    });

    return { reviews, total, page, limit };
  }

  /**
   * Admin: Query all reviews across system with filters.
   */
  public async findAdminReviews(
    options: ReviewQueryOptions = {}
  ): Promise<{ reviews: AdminReviewDTO[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<IReviewDoc> = {};

    if (options.status) filter.status = options.status;
    if (options.rating) filter.rating = options.rating;
    if (options.vehicleId && Types.ObjectId.isValid(options.vehicleId)) {
      filter.vehicleId = new Types.ObjectId(options.vehicleId);
    }
    if (options.userId && Types.ObjectId.isValid(options.userId)) {
      filter.userId = new Types.ObjectId(options.userId);
    }
    if (options.startDate || options.endDate) {
      filter.createdAt = {};
      if (options.startDate) filter.createdAt.$gte = options.startDate;
      if (options.endDate) filter.createdAt.$lte = options.endDate;
    }

    const [docs, total] = await Promise.all([
      ReviewModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate<{ userId: { id: string; name: string; avatar?: string; email?: string } }>(
          'userId',
          'name avatar email'
        )
        .exec(),
      ReviewModel.countDocuments(filter).exec()
    ]);

    const reviews = docs.map((doc) => {
      const userRef = doc.userId as any;
      const author: ReviewAuthorDTO = {
        id: userRef?.id || String(doc.userId),
        name: userRef?.name || 'Verified Customer',
        avatar: userRef?.avatar
      };
      return doc.toAdminDTO(author);
    });

    return { reviews, total, page, limit };
  }

  /**
   * Updates an existing review (controlled edit).
   */
  public async updateReview(
    id: string,
    update: {
      rating?: number;
      title?: string;
      comment?: string;
      editedAt?: Date;
    }
  ): Promise<IReviewDoc | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    return await ReviewModel.findByIdAndUpdate(
      id,
      {
        $set: {
          ...update,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    ).exec();
  }

  /**
   * Soft-delete review with audit tracking.
   */
  public async softDeleteReview(id: string): Promise<IReviewDoc | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    return await ReviewModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: ReviewStatus.DELETED,
          isDeleted: true,
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    ).exec();
  }

  /**
   * Admin moderation state update.
   */
  public async updateModeration(
    id: string,
    update: {
      status: ReviewStatus;
      moderationStatus?: ReviewModerationStatus;
      rejectionReason?: string;
      moderatedBy?: string;
    }
  ): Promise<IReviewDoc | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    const updateDoc: any = {
      status: update.status,
      updatedAt: new Date(),
      moderatedAt: new Date()
    };

    if (update.moderationStatus) updateDoc.moderationStatus = update.moderationStatus;
    if (update.rejectionReason !== undefined) updateDoc.rejectionReason = update.rejectionReason;
    if (update.moderatedBy && Types.ObjectId.isValid(update.moderatedBy)) {
      updateDoc.moderatedBy = new Types.ObjectId(update.moderatedBy);
    }

    return await ReviewModel.findByIdAndUpdate(id, { $set: updateDoc }, { returnDocument: 'after' }).exec();
  }

  /**
   * Helpful Vote: Checks if a vote exists.
   */
  public async hasUserVotedHelpful(reviewId: string, userId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(reviewId) || !Types.ObjectId.isValid(userId)) return false;
    const exists = await ReviewHelpfulVoteModel.exists({
      reviewId: new Types.ObjectId(reviewId),
      userId: new Types.ObjectId(userId)
    });
    return Boolean(exists);
  }

  /**
   * Helpful Vote: Adds a vote and increments counter atomically.
   */
  public async addHelpfulVote(
    reviewId: string,
    userId: string
  ): Promise<{ voted: boolean; helpfulCount: number }> {
    const rId = new Types.ObjectId(reviewId);
    const uId = new Types.ObjectId(userId);

    try {
      await ReviewHelpfulVoteModel.create({ reviewId: rId, userId: uId });
      const updated = await ReviewModel.findByIdAndUpdate(
        rId,
        { $inc: { helpfulCount: 1 } },
        { returnDocument: 'after' }
      ).exec();

      return { voted: true, helpfulCount: updated?.helpfulCount || 0 };
    } catch (err: any) {
      if (err?.code === 11000) {
        // Already voted
        const review = await ReviewModel.findById(rId).exec();
        return { voted: true, helpfulCount: review?.helpfulCount || 0 };
      }
      throw err;
    }
  }

  /**
   * Helpful Vote: Removes a vote and decrements counter atomically.
   */
  public async removeHelpfulVote(
    reviewId: string,
    userId: string
  ): Promise<{ voted: boolean; helpfulCount: number }> {
    const rId = new Types.ObjectId(reviewId);
    const uId = new Types.ObjectId(userId);

    const deleted = await ReviewHelpfulVoteModel.findOneAndDelete({
      reviewId: rId,
      userId: uId
    }).exec();

    if (deleted) {
      const updated = await ReviewModel.findByIdAndUpdate(
        rId,
        { $inc: { helpfulCount: -1 } },
        { returnDocument: 'after' }
      ).exec();
      return { voted: false, helpfulCount: Math.max(0, updated?.helpfulCount || 0) };
    }

    const review = await ReviewModel.findById(rId).exec();
    return { voted: false, helpfulCount: review?.helpfulCount || 0 };
  }

  /**
   * Abuse Report: Creates abuse report and increments report counter.
   */
  public async createReport(data: {
    reviewId: string;
    reportedBy: string;
    reason: ReportReason;
    description?: string;
  }): Promise<IReviewReportDoc> {
    const report = await ReviewReportModel.create({
      reviewId: new Types.ObjectId(data.reviewId),
      reportedBy: new Types.ObjectId(data.reportedBy),
      reason: data.reason,
      description: data.description || '',
      status: ReportStatus.PENDING
    });

    await ReviewModel.findByIdAndUpdate(data.reviewId, {
      $inc: { reportedCount: 1 }
    }).exec();

    return report;
  }

  /**
   * Admin: List abuse reports.
   */
  public async findReports(options: {
    page?: number;
    limit?: number;
    status?: ReportStatus;
  } = {}): Promise<{ reports: any[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const skip = (page - 1) * limit;

    const filter: FilterQuery<IReviewReportDoc> = {};
    if (options.status) filter.status = options.status;

    const [docs, total] = await Promise.all([
      ReviewReportModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate<{ reportedBy: { name: string; email: string } }>('reportedBy', 'name email')
        .populate('reviewId')
        .exec(),
      ReviewReportModel.countDocuments(filter).exec()
    ]);

    return {
      reports: docs.map((d) => d.toDTO()),
      total,
      page,
      limit
    };
  }

  /**
   * Admin: Resolve or dismiss abuse report.
   */
  public async updateReportStatus(
    id: string,
    update: {
      status: ReportStatus;
      resolvedBy: string;
      resolutionNotes?: string;
    }
  ): Promise<IReviewReportDoc | null> {
    if (!Types.ObjectId.isValid(id)) return null;

    return await ReviewReportModel.findByIdAndUpdate(
      id,
      {
        $set: {
          status: update.status,
          resolvedBy: new Types.ObjectId(update.resolvedBy),
          resolvedAt: new Date(),
          resolutionNotes: update.resolutionNotes || null,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    ).exec();
  }
}

export const reviewRepository = new ReviewRepository();
export default reviewRepository;
