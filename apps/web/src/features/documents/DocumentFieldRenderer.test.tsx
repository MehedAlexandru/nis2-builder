import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { documentFieldSchema } from '@nis2/shared';
import { DocumentFieldRenderer } from './DocumentFieldRenderer';

describe('document field renderer', () => {
  it('renders a text field from the template definition', async () => {
    const onChange = vi.fn();
    const field = documentFieldSchema.parse({
      key: 'policyOwner',
      type: 'text',
      label: { en: 'Policy owner', ro: 'Proprietarul politicii' },
      required: true,
      help: { en: 'Name the accountable person.', ro: 'Numiti persoana responsabila.' },
    });
    render(<DocumentFieldRenderer field={field} value="" locale="en" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Policy owner'), 'CISO');
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText('Name the accountable person.')).toBeInTheDocument();
  });

  it('adds and edits table rows', async () => {
    const onChange = vi.fn();
    const field = documentFieldSchema.parse({
      key: 'assets',
      type: 'table',
      label: { en: 'Assets', ro: 'Active' },
      columns: [
        { key: 'asset', label: { en: 'Asset', ro: 'Activ' }, type: 'text', required: true },
        { key: 'owner', label: { en: 'Owner', ro: 'Proprietar' }, type: 'text' },
      ],
      validation: { minRows: 1 },
    });
    render(<DocumentFieldRenderer field={field} value={[]} locale="en" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: /add row/i }));
    expect(onChange).toHaveBeenCalledWith([{ asset: '', owner: '' }]);
    expect(screen.getByText('At least 1 rows')).toBeInTheDocument();
  });

  it('records checklist and risk matrix values', async () => {
    const onChange = vi.fn();
    const checklist = documentFieldSchema.parse({
      key: 'controls',
      type: 'checklist',
      label: { en: 'Controls', ro: 'Controale' },
      items: [{ key: 'mfa', label: { en: 'MFA enabled', ro: 'MFA activat' } }],
    });
    const { rerender } = render(
      <DocumentFieldRenderer field={checklist} value={{}} locale="en" onChange={onChange} />,
    );
    await userEvent.click(screen.getByLabelText('MFA enabled'));
    expect(onChange).toHaveBeenCalledWith({ mfa: true });

    const risk = documentFieldSchema.parse({
      key: 'risk',
      type: 'riskMatrix',
      label: { en: 'Residual risk', ro: 'Risc rezidual' },
    });
    rerender(<DocumentFieldRenderer field={risk} value={{}} locale="en" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Likelihood'), '4');
    expect(onChange).toHaveBeenCalledWith({ likelihood: 4 });
  });
});
