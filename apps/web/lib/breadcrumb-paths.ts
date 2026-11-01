/**
 * Folders of the dashboard that only group pages and have no page of their own. Their crumb
 * is plain text: a link would open "page not found". A spec fails when a new such folder appears.
 */
export const CRUMBS_WITHOUT_PAGE: readonly string[] = ['/settings/integrations', '/hr/payslips'];
