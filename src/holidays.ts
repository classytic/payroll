/**
 * @classytic/payroll - Holiday Management
 *
 * Simple holiday storage and retrieval.
 * ONE way to manage holidays - no confusion.
 */

import { Schema, type Model } from 'mongoose';

/**
 * Holiday document
 */
export interface Holiday {
  organizationId?: any;
  date: Date;
  name: string;
  type: 'public' | 'company' | 'religious';
  paid: boolean;
}

/**
 * Create holiday schema
 *
 * @example
 * ```typescript
 * import { createHolidaySchema } from '@classytic/payroll';
 *
 * // Multi-tenant
 * const Holiday = model('Holiday', createHolidaySchema());
 *
 * // Single-tenant
 * const Holiday = model('Holiday', createHolidaySchema({ singleTenant: true }));
 * ```
 */
export function createHolidaySchema(options: {
  singleTenant?: boolean;
} = {}): Schema {
  const fields: any = {
    date: { type: Date, required: true, index: true },
    name: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['public', 'company', 'religious'], 
      default: 'company' 
    },
    paid: { type: Boolean, default: true },
  };

  if (!options.singleTenant) {
    fields.organizationId = {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    };
  }

  const schema = new Schema(fields, { timestamps: true });

  // Indexes
  if (!options.singleTenant) {
    schema.index({ organizationId: 1, date: 1 });
  } else {
    schema.index({ date: 1 });
  }

  return schema;
}

/**
 * Get holidays for a period
 *
 * @example
 * ```typescript
 * const holidays = await getHolidays(Holiday, {
 *   organizationId: org._id, // optional for single-tenant
 *   startDate: new Date('2024-03-01'),
 *   endDate: new Date('2024-03-31'),
 * });
 * ```
 */
export async function getHolidays(
  HolidayModel: Model<any>,
  params: {
    organizationId?: any;
    startDate: Date;
    endDate: Date;
  }
): Promise<Date[]> {
  const query: any = {
    date: { $gte: params.startDate, $lte: params.endDate },
  };

  if (params.organizationId) {
    query.organizationId = params.organizationId;
  }

  const holidays = await HolidayModel.find(query).select('date').lean();
  return holidays.map((h: { date: Date }) => h.date);
}

