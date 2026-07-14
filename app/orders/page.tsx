import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Interim: the sequential order tracker with left filters + download lands in Phase D.
export default function OrdersPage() {
  redirect('/bookings');
}
