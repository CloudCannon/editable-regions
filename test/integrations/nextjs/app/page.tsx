'use client'

import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      import('../live-editing')
    }
  }, []);

  return (
    <div>
      <p>Welcome to Nextjs!</p>
    </div>
  );
}
