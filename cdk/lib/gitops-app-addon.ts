import { Construct } from 'constructs';
import * as blueprints from '@aws-quickstart/eks-blueprints';

export interface GitOpsAppAddOnProps {
  name: string;
  repoUrl: string;
  path: string;
  targetRevision?: string;
  namespace: string;
}

/**
 * Registers one Argo CD Application that keeps `path` of `repoUrl` synced into the cluster.
 * Merging a change to that path (for example a fix PR) rolls it out automatically.
 */
export class GitOpsAppAddOn implements blueprints.ClusterAddOn {
  constructor(private readonly props: GitOpsAppAddOnProps) {}

  @blueprints.utils.dependable(blueprints.addons.ArgoCDAddOn.name)
  deploy(clusterInfo: blueprints.ClusterInfo): Promise<Construct> {
    const p = this.props;
    const manifest = clusterInfo.cluster.addManifest(`argo-app-${p.name}`, {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Application',
      metadata: { name: p.name, namespace: 'argocd' },
      spec: {
        project: 'default',
        source: { repoURL: p.repoUrl, path: p.path, targetRevision: p.targetRevision ?? 'main' },
        destination: { server: 'https://kubernetes.default.svc', namespace: p.namespace },
        syncPolicy: {
          automated: { prune: true, selfHeal: true },
          syncOptions: ['CreateNamespace=true'],
          retry: { limit: -1, backoff: { duration: '30s', factor: 2, maxDuration: '5m' } },
        },
      },
    });
    return Promise.resolve(manifest);
  }
}
