import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import BackgroundJobsTab from '../components/admin/BackgroundJobsTab';

const BackgroundJobsPage = () => (
  <Layout>
    <Header
      title="Background Jobs"
      subtitle="Execution status, history and errors of all background jobs and crons"
    />
    <div className="px-6 mt-2 pb-8">
      <BackgroundJobsTab />
    </div>
  </Layout>
);

export default BackgroundJobsPage;
