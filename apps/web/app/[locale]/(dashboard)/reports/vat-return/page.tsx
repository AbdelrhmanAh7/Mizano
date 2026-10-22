import { redirect } from 'next/navigation';

export default function VatReturnRedirectPage() {
  redirect('/tax/returns/generate');
}
