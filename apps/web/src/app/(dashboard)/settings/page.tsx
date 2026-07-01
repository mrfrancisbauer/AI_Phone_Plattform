import { redirect } from 'next/navigation';

// The old "Einstellungen" page has been split into the Unternehmen section.
export default function SettingsRedirect() {
  redirect('/company/general');
}
