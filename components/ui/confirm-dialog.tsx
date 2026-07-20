"use client";

import * as React from "react";
import { Modal, ModalFooter } from "./modal";
import { Button } from "./button";

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

type PendingConfirm = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = React.createContext<
  ((opts: ConfirmOptions) => Promise<boolean>) | null
>(null);

// App-wide replacement for window.confirm() — a themed Modal instead of the
// unbranded browser dialog. One instance mounted in the shell layout;
// useConfirm() returns a promise-based confirm() so existing
// `if (!window.confirm(...)) return;` call sites convert to
// `if (!(await confirm({...}))) return;` with no other restructuring.
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <Modal
          title={pending.title}
          description={pending.description}
          onClose={() => settle(false)}
          size="sm"
          tone={pending.tone === "danger" ? "danger" : "default"}
        >
          <ModalFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {pending.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={pending.tone === "danger" ? "destructive" : "default"}
              // Design system note (button.tsx): destructive is a danger
              // outline everywhere EXCEPT inside a confirm — here it's
              // solid, since this is the one place a wrong click is costly.
              className={
                pending.tone === "danger"
                  ? "border-transparent bg-danger text-white hover:bg-danger/90"
                  : undefined
              }
              onClick={() => settle(true)}
            >
              {pending.confirmLabel ?? "Confirm"}
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
