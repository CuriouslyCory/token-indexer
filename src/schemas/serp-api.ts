import { z } from "zod";

const searchMetadataSchema = z.object({
  id: z.string(),
  status: z.string(),
  json_endpoint: z.string(),
  created_at: z.string(),
  processed_at: z.string(),
  google_url: z.string(),
  raw_html_file: z.string(),
  total_time_taken: z.number(),
});

const searchParametersSchema = z.object({
  engine: z.string(),
  q: z.string(),
  location_requested: z.string().optional().nullable(),
  location_used: z.string().optional().nullable(),
  google_domain: z.string(),
  hl: z.string().optional().nullable(),
  gl: z.string().optional().nullable(),
  device: z.string(),
});

const recipesResultsSchema = z.array(
  z.object({
    title: z.string(),
    link: z.string(),
    source: z.string(),
    total_time: z.string().optional(),
    ingredients: z.array(z.string()),
    thumbnail: z.string(),
  })
);

const shoppingResultsSchema = z.array(
  z.object({
    position: z.number(),
    block_position: z.string(),
    title: z.string(),
    price: z.string(),
    extracted_price: z.number(),
    link: z.string(),
    source: z.string(),
    reviews: z.number(),
    thumbnail: z.string(),
  })
);

const localMapSchema = z.object({
  link: z.string(),
  image: z.string(),
  gps_coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
});

const localResultsSchema = z.object({
  more_locations_link: z.string(),
  places: z.array(
    z.object({
      position: z.number(),
      title: z.string(),
      place_id: z.string(),
      lsig: z.string(),
      place_id_search: z.string(),
      rating: z.number(),
      reviews: z.number(),
      price: z.string(),
      type: z.string(),
      address: z.string(),
      thumbnail: z.string(),
      gps_coordinates: z.object({
        latitude: z.number(),
        longitude: z.number(),
      }),
    })
  ),
});

const knowledgeGraphSchema = z.object({
  title: z.string(),
  type: z.string(),
  kgmid: z.string(),
  knowledge_graph_search_link: z.string(),
  serpapi_knowledge_graph_search_link: z.string(),
  header_images: z.array(
    z.object({
      image: z.string(),
      source: z.string(),
    })
  ),
  description: z.string(),
  source: z.object({
    name: z.string(),
    link: z.string(),
  }),
  patron_saint: z.string().optional(),
  patron_saint_links: z
    .array(
      z.object({
        text: z.string(),
        link: z.string(),
      })
    )
    .optional(),
  species_of_coffee: z
    .array(
      z.object({
        name: z.string(),
        link: z.string(),
        image: z.string(),
      })
    )
    .optional(),
  coffee_books: z
    .array(
      z.object({
        name: z.string(),
        link: z.string(),
        image: z.string(),
      })
    )
    .optional(),
});

const paginationSchema = z.object({
  current: z.number(),
  next: z.string().optional(),
  other_pages: z.record(z.string()).optional(),
});

const serpapiPaginationSchema = z.object({
  current: z.number(),
  next_link: z.string(),
  next: z.string(),
  other_pages: z.record(z.string()),
});

const serpApiSearchResultSchema = z.object({
  search_metadata: searchMetadataSchema,
  search_parameters: searchParametersSchema,
  search_information: z.object({
    organic_results_state: z.string(),
    query_displayed: z.string(),
    total_results: z.number().optional().nullable(),
    time_taken_displayed: z.number().optional().nullable(),
  }),
  recipes_results: recipesResultsSchema.optional(),
  shopping_results: shoppingResultsSchema.optional(),
  local_map: localMapSchema.optional(),
  local_results: localResultsSchema.optional(),
  knowledge_graph: knowledgeGraphSchema.optional(),
  related_questions: z
    .array(
      z.object({
        question: z.string(),
        snippet: z.string().optional().nullable(),
        title: z.string(),
        link: z.string(),
        displayed_link: z.string().optional().nullable(),
      })
    )
    .optional(),
  organic_results: z
    .array(
      z.object({
        position: z.number(),
        title: z.string(),
        link: z.string(),
        displayed_link: z.string(),
        snippet: z.string(),
        sitelinks: z
          .object({
            inline: z.array(
              z.object({
                title: z.string(),
                link: z.string(),
              })
            ),
          })
          .optional(),
        about_this_result: z
          .object({
            source: z.object({
              description: z.string(),
              source_info_link: z.string(),
              security: z.string(),
              icon: z.string(),
            }),
            keywords: z.array(z.string()),
            languages: z.array(z.string()),
            regions: z.array(z.string()),
          })
          .optional(),
        cached_page_link: z.string().optional(),
      })
    )
    .optional(),
  related_searches: z
    .array(
      z.object({
        query: z.string(),
        link: z.string(),
      })
    )
    .optional(),
  pagination: paginationSchema.optional(),
  serpapi_pagination: serpapiPaginationSchema.optional(),
});

export default serpApiSearchResultSchema;
