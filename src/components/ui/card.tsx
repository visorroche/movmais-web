import * as React from "react";

export type CardProps = React.PropsWithChildren<React.HTMLAttributes<HTMLDivElement>>;

export const Card = ({ className, ...props }: CardProps) => {
  return <div className={"rounded-xl border " + (className || "")} {...props} />;
};
