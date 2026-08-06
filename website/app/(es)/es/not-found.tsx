import Link from 'next/link';

/** 404 con marca para el árbol en español — véase app/(en)/not-found.tsx. */
export default function NotFound() {
  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '96px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--brand)' }}>
        404
      </p>
      <h1 style={{ margin: '12px 0 14px' }}>Esta página no existe</h1>
      <p style={{ color: 'var(--ink2)', lineHeight: 1.6 }}>
        Puede que el enlace sea antiguo o que la dirección esté mal escrita.
        Todo lo que ofrece Semora está disponible desde la página principal.
      </p>
      <p style={{ marginTop: 28 }}>
        <Link
          href="/es"
          style={{
            display: 'inline-block',
            background: 'var(--ink)',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
            padding: '13px 26px',
            borderRadius: 999,
          }}
        >
          Volver a la página principal
        </Link>
      </p>
    </div>
  );
}
