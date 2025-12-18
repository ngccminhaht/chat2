import { redirect } from 'next/navigation';

export default function CreateOrganizationRedirect() {
  redirect('/organizations/new');
}
