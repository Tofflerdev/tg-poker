import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LeaveTableModal from '../LeaveTableModal';

function renderModal(props: Partial<React.ComponentProps<typeof LeaveTableModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const utils = render(
    <LeaveTableModal
      stack={1500}
      inHand={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  // The heading and the primary button share the text "Leave table"; always
  // reach for the button by role so the two never get confused.
  const leaveButton = () => screen.getByRole('button', { name: /leave table/i });
  return { ...utils, onConfirm, onCancel, leaveButton };
}

describe('LeaveTableModal', () => {
  it('"Leave table" confirms and does not also cancel', () => {
    const { onConfirm, onCancel, leaveButton } = renderModal();
    fireEvent.click(leaveButton());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('"Stay" cancels and does not leave', () => {
    const { onConfirm, onCancel } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /^stay$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('tapping the backdrop cancels', () => {
    const { container, onCancel, onConfirm } = renderModal();
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('tapping inside the sheet does not cancel (stopPropagation)', () => {
    const { onCancel } = renderModal();
    fireEvent.click(screen.getByTestId('leave-table-modal'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('quotes the stack in chips and dollars when seated', () => {
    // crypto-payments-rake peg: 1 chip = $0.01 → 1500 chips = $15.00.
    // The chip count goes through toLocaleString(), so the grouping separator
    // depends on the runtime locale — match on the digits, not the separator.
    renderModal({ stack: 1500 });
    // (`$15.00` normalizes to the same digits, hence the leading-digit anchor.)
    expect(
      screen.getByText((text) => /^\d/.test(text) && text.replace(/\D/g, '') === '1500')
    ).toBeInTheDocument();
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.getByText(/returned to your balance/i)).toBeInTheDocument();
  });

  it('omits the stack readout while only spectating', () => {
    renderModal({ stack: null });
    expect(screen.queryByText(/returned to your balance/i)).not.toBeInTheDocument();
  });

  it('omits the stack readout on a busted (zero-chip) stack', () => {
    renderModal({ stack: 0 });
    expect(screen.queryByText(/returned to your balance/i)).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('warns that a live hand will be folded', () => {
    renderModal({ inHand: true });
    expect(screen.getByText(/current hand will be folded/i)).toBeInTheDocument();
    expect(screen.queryByText(/seat will be freed/i)).not.toBeInTheDocument();
  });

  it('mentions freeing the seat when no hand is live', () => {
    renderModal({ inHand: false });
    expect(screen.getByText(/seat will be freed/i)).toBeInTheDocument();
    expect(screen.queryByText(/current hand will be folded/i)).not.toBeInTheDocument();
  });
});
