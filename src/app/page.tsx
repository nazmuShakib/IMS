import { redirect } from 'next/navigation';

export default function Home() {
  // The dashboard is Phase 4. Until then, products is the front door.
  redirect('/products');
}
