import React from 'react';

const Footer = () => (
  <footer
    className="shrink-0 flex items-center justify-center px-6 py-1.5 border-t"
    style={{
      backgroundColor: `rgb(var(--ds-surface))`,
      borderColor: `rgb(var(--ds-border))`,
    }}
  >
    <p
      className="text-[10px] font-medium tracking-wide select-none"
      style={{ color: `rgb(var(--ds-text-muted))` }}
    >
      © {new Date().getFullYear()} DSV Corp Pty Ltd. All rights reserved.&nbsp;Delivery Sync
    </p>
  </footer>
);

export default Footer;
