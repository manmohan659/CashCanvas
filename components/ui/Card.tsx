import React, { ReactNode } from 'react';

interface CardProps { title?: string; children: ReactNode; right?: ReactNode }

export default function Card({ title, children, right }: CardProps) {
  return (
    <section className="card">
      {(title || right) && (
        <div className="card-head">
          {title && <h3 className="card-title">{title}</h3>}
          {right && <div className="card-actions">{right}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}


