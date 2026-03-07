/** Configuration for customizing the generated OpenAPI spec. */
export interface OpenApiConfig {
  title?: string;
  version?: string;
  description?: string;
  servers?: Array<{ url: string; description?: string }>;
}
