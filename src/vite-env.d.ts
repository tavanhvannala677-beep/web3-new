/// <reference types="vite/client" />

import 'react';

declare module 'react' {
  interface DialogHTMLAttributes<T> extends HTMLAttributes<T> {
    closedby?: 'any' | 'closerequest' | 'none';
  }
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    autocorrect?: string;
    autocapitalize?: string;
    spellcheck?: boolean | 'true' | 'false';
  }
}
