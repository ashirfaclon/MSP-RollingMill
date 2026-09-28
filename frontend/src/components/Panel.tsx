import type { ReactNode } from 'react';

/** The standard framed card: optional numbered index, title, right-hand slot. */
export default function Panel(props: {
  title?: ReactNode;
  index?: number | string;
  sub?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
  onTitleClick?: () => void;
}) {
  return (
    <section className={`panel ${props.className ?? ''}`}>
      {(props.title || props.right) && (
        <header className="panel-head">
          <div
            className={`panel-title${props.onTitleClick ? ' clickable' : ''}`}
            onClick={props.onTitleClick}
          >
            {props.index !== undefined && <span className="idx">{props.index}</span>}
            {props.title}
          </div>
          {props.sub && <span className="panel-sub">{props.sub}</span>}
          <span className="spacer" />
          {props.right}
        </header>
      )}
      <div className={`panel-body ${props.bodyClass ?? ''}`}>{props.children}</div>
    </section>
  );
}
