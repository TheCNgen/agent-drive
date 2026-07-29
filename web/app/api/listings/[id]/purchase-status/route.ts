import { Transaction } from "@/app/models/Transaction";
import connectDB from "@/app/lib/mongodb";
import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/app/lib/backend/resolvePrincipal";
import { principalErrorToResponse } from "@/app/lib/backend/errors";
import { Types } from "mongoose";

const isValidObjectId = (id: string): boolean => {
  return Types.ObjectId.isValid(id);
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();
    const principal = await requirePrincipal(request, 'listings:read');

    const params = await context.params;
    const { id } = params;

    if (!id || !isValidObjectId(id)) {
      return NextResponse.json(
        { error: "Invalid listing ID" },
        { status: 400 }
      );
    }

    // Check if user has a completed transaction for this listing
    const transaction = await Transaction.findOne({
      listing: id,
      buyer: principal.userId,
      status: 'completed'
    });

    return NextResponse.json({
      hasPurchased: !!transaction,
      transaction: transaction ? {
        id: transaction._id,
        date: transaction.createdAt
      } : null
    });
  } catch (error: any) {
    const principalResponse = principalErrorToResponse(error);
    if (principalResponse) return principalResponse;
    console.error("GET /api/listings/[id]/purchase-status error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to check purchase status" },
      { status: 500 }
    );
  }
}