import { notFound } from 'next/navigation';
import { routeForPath } from '@/lib/routes';
import { metadataForPath } from '@/lib/seo';
type Props = { params: Promise<{ path?: string[] }> };
const pathFrom = (parts?: string[]) =>
  parts?.length ? `/${parts.join('/')}` : '/';
export async function generateMetadata({ params }: Props) {
  return metadataForPath(pathFrom((await params).path));
}
export default async function Page({ params }: Props) {
  const route = routeForPath(pathFrom((await params).path));
  if (!route) notFound();
  return null;
}
