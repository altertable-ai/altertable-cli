export type WhoamiResponse = {
  principal: {
    type?: string;
    name?: string;
    email?: string;
    slug?: string;
  };
  organization: {
    name?: string;
    slug?: string;
  };
  authentication_scope?: string;
  environment_slug?: string;
};

export type CatalogRow = {
  type: string;
  name: string;
  slug: string;
  engine: string;
  catalog: string;
};
