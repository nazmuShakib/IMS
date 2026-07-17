import { Card } from '@/components/ui';
import { LoginForm } from '@/components/auth/LoginForm';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-plate p-5">
      <div className="w-full max-w-sm">
        <div className="mb-5">
          <p className="eyebrow">Electronics Shop</p>
          <h1 className="mt-1 text-[24px] font-semibold">Inventory sign in</h1>
        </div>
        <Card className="p-5">
          {error === 'inactive' && (
            <p className="mb-4 rounded-[3px] border border-out/20 bg-out-wash px-3 py-2 text-[12px] text-out">
              This account is inactive. Contact an administrator.
            </p>
          )}
          <LoginForm next={next} />
        </Card>
      </div>
    </main>
  );
}
