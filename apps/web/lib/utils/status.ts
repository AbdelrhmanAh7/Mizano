/**
 * Centralized status color/label configuration for all entity statuses.
 *
 * Replaces 35+ scattered getXxxStatusColor/getXxxStatusLabel functions
 * with a single config-driven system.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusConfig {
  label: string;
  color: string;
}

type StatusMap<T extends string = string> = Record<T, StatusConfig>;

// ---------------------------------------------------------------------------
// Default fallback
// ---------------------------------------------------------------------------

const DEFAULT_STATUS: StatusConfig = {
  label: 'Unknown',
  color: 'bg-gray-100 text-gray-800',
};

// ---------------------------------------------------------------------------
// Invoice Status
// ---------------------------------------------------------------------------

export const invoiceStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  SENT: { label: 'Sent', color: 'bg-blue-100 text-blue-800' },
  PARTIALLY_PAID: { label: 'Partially Paid', color: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: 'Paid', color: 'bg-green-100 text-green-800' },
  OVERDUE: { label: 'Overdue', color: 'bg-red-100 text-red-800' },
  VOID: { label: 'Void', color: 'bg-gray-100 text-gray-500' },
};

// ---------------------------------------------------------------------------
// Quote Status
// ---------------------------------------------------------------------------

export const quoteStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  SENT: { label: 'Sent', color: 'bg-blue-100 text-blue-800' },
  ACCEPTED: { label: 'Accepted', color: 'bg-green-100 text-green-800' },
  INVOICED: { label: 'Invoiced', color: 'bg-purple-100 text-purple-800' },
  DECLINED: { label: 'Declined', color: 'bg-red-100 text-red-800' },
  EXPIRED: { label: 'Expired', color: 'bg-orange-100 text-orange-800' },
};

// ---------------------------------------------------------------------------
// Bill Status
// ---------------------------------------------------------------------------

export const billStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  OPEN: { label: 'Open', color: 'bg-blue-100 text-blue-800' },
  OVERDUE: { label: 'Overdue', color: 'bg-red-100 text-red-800' },
  PARTIAL: { label: 'Partial', color: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: 'Paid', color: 'bg-green-100 text-green-800' },
  VOID: { label: 'Void', color: 'bg-gray-100 text-gray-500' },
};

// ---------------------------------------------------------------------------
// Account Type
// ---------------------------------------------------------------------------

export const accountType: StatusMap = {
  ASSET: { label: 'Asset', color: 'bg-blue-100 text-blue-800' },
  LIABILITY: { label: 'Liability', color: 'bg-orange-100 text-orange-800' },
  EQUITY: { label: 'Equity', color: 'bg-purple-100 text-purple-800' },
  REVENUE: { label: 'Revenue', color: 'bg-green-100 text-green-800' },
  INCOME: { label: 'Income', color: 'bg-green-100 text-green-800' },
  EXPENSE: { label: 'Expense', color: 'bg-red-100 text-red-800' },
};

// ---------------------------------------------------------------------------
// Project Status
// ---------------------------------------------------------------------------

export const projectStatus: StatusMap = {
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-800' },
  COMPLETED: { label: 'Completed', color: 'bg-blue-100 text-blue-800' },
  ON_HOLD: { label: 'On Hold', color: 'bg-yellow-100 text-yellow-800' },
  CANCELLED: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800' },
};

// ---------------------------------------------------------------------------
// Task Status
// ---------------------------------------------------------------------------

export const taskStatus: StatusMap = {
  TODO: { label: 'To Do', color: 'bg-gray-100 text-gray-800' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800' },
};

// ---------------------------------------------------------------------------
// Employee Status
// ---------------------------------------------------------------------------

export const employeeStatus: StatusMap = {
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-800' },
  INACTIVE: { label: 'Inactive', color: 'bg-yellow-100 text-yellow-800' },
  TERMINATED: { label: 'Terminated', color: 'bg-red-100 text-red-800' },
};

// ---------------------------------------------------------------------------
// Attendance Status
// ---------------------------------------------------------------------------

export const attendanceStatus: StatusMap = {
  PRESENT: { label: 'Present', color: 'bg-green-100 text-green-800' },
  ABSENT: { label: 'Absent', color: 'bg-red-100 text-red-800' },
  LEAVE: { label: 'Leave', color: 'bg-blue-100 text-blue-800' },
  HALF_DAY: { label: 'Half Day', color: 'bg-yellow-100 text-yellow-800' },
};

// ---------------------------------------------------------------------------
// Payroll Status
// ---------------------------------------------------------------------------

export const payrollStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  CONFIRMED: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800' },
  PAID: { label: 'Paid', color: 'bg-green-100 text-green-800' },
};

// ---------------------------------------------------------------------------
// Transfer Status
// ---------------------------------------------------------------------------

export const transferStatus: StatusMap = {
  PENDING: { label: 'Pending', color: 'bg-gray-100 text-gray-800' },
  IN_TRANSIT: { label: 'In Transit', color: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-800' },
};

// ---------------------------------------------------------------------------
// Adjustment Status
// ---------------------------------------------------------------------------

export const adjustmentStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  POSTED: { label: 'Posted', color: 'bg-green-100 text-green-800' },
};

// ---------------------------------------------------------------------------
// Lead Status (CRM)
// ---------------------------------------------------------------------------

export const leadStatus: StatusMap = {
  NEW: { label: 'New', color: 'bg-blue-100 text-blue-800' },
  CONTACTED: { label: 'Contacted', color: 'bg-yellow-100 text-yellow-800' },
  QUALIFIED: { label: 'Qualified', color: 'bg-green-100 text-green-800' },
  UNQUALIFIED: { label: 'Unqualified', color: 'bg-gray-100 text-gray-800' },
  JUNK: { label: 'Junk', color: 'bg-red-100 text-red-800' },
};

// ---------------------------------------------------------------------------
// Deal Stage (CRM)
// ---------------------------------------------------------------------------

export const dealStage: StatusMap = {
  NEW: { label: 'New', color: 'bg-blue-100 text-blue-800' },
  MEETING_SCHEDULED: { label: 'Meeting Scheduled', color: 'bg-yellow-100 text-yellow-800' },
  PROPOSAL_SENT: { label: 'Proposal Sent', color: 'bg-purple-100 text-purple-800' },
  NEGOTIATION: { label: 'Negotiation', color: 'bg-orange-100 text-orange-800' },
  WON: { label: 'Won', color: 'bg-green-100 text-green-800' },
  LOST: { label: 'Lost', color: 'bg-red-100 text-red-800' },
};

// ---------------------------------------------------------------------------
// BOM Status (Manufacturing)
// ---------------------------------------------------------------------------

export const bomStatus: StatusMap = {
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-800 border-green-200' },
  INACTIVE: { label: 'Inactive', color: 'bg-gray-100 text-gray-800 border-gray-200' },
};

// ---------------------------------------------------------------------------
// Work Order Status (Manufacturing)
// ---------------------------------------------------------------------------

export const workOrderStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  IN_PROCESS: { label: 'In Process', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  COMPLETED: { label: 'Completed', color: 'bg-green-100 text-green-800 border-green-200' },
  CANCELLED: { label: 'Cancelled', color: 'bg-red-100 text-red-800 border-red-200' },
};

// ---------------------------------------------------------------------------
// Asset Status
// ---------------------------------------------------------------------------

export const assetStatus: StatusMap = {
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-800' },
  DISPOSED: { label: 'Disposed', color: 'bg-gray-100 text-gray-800' },
  FULLY_DEPRECIATED: { label: 'Fully Depreciated', color: 'bg-yellow-100 text-yellow-800' },
};

// ---------------------------------------------------------------------------
// Delivery Challan Status
// ---------------------------------------------------------------------------

export const challanStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  ISSUED: { label: 'Issued', color: 'bg-blue-100 text-blue-800' },
  RETURNED: { label: 'Returned', color: 'bg-green-100 text-green-800' },
};

// ---------------------------------------------------------------------------
// VAT Return Status
// ---------------------------------------------------------------------------

export const vatReturnStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800 border-gray-200' },
  FILED: { label: 'Filed', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  PAID: { label: 'Paid', color: 'bg-green-100 text-green-800 border-green-200' },
};

// ---------------------------------------------------------------------------
// Journal Status
// ---------------------------------------------------------------------------

export const journalStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  POSTED: { label: 'Posted', color: 'bg-green-100 text-green-800' },
};

// ---------------------------------------------------------------------------
// Expense Status
// ---------------------------------------------------------------------------

export const expenseStatus: StatusMap = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  APPROVED: { label: 'Approved', color: 'bg-blue-100 text-blue-800' },
  PAID: { label: 'Paid', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
};

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/**
 * Get the status label for a given status value from a status map.
 */
export function getStatusLabel(statusMap: StatusMap, status: string): string {
  return statusMap[status]?.label ?? status;
}

/**
 * Get the status color classes for a given status value from a status map.
 */
export function getStatusColor(statusMap: StatusMap, status: string): string {
  return statusMap[status]?.color ?? DEFAULT_STATUS.color;
}

/**
 * Get both label and color for a given status value.
 */
export function getStatusConfig(statusMap: StatusMap, status: string): StatusConfig {
  return statusMap[status] ?? { ...DEFAULT_STATUS, label: status };
}

/**
 * Convert a status map to an array of options for dropdowns/selects.
 */
export function toStatusOptions(statusMap: StatusMap): Array<{ value: string; label: string }> {
  return Object.entries(statusMap).map(([value, config]) => ({
    value,
    label: config.label,
  }));
}
