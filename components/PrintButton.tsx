'use client';
export default function PrintButton() {
  return <button type="button" className="btn-order outline" onClick={() => window.print()}>Print</button>;
}
