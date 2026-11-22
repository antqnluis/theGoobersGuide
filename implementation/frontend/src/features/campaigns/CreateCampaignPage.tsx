import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CampaignForm } from './CampaignForm'
import { createCampaign } from './campaignService'
import { moveGalaxyPlanet, parsePlanetParam } from './galaxyPlanets'
import { toCampaignInput } from './campaignValidation'

export function CreateCampaignPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Creating from an uncharted planet (`?planet=<slot>`) asks for that planet.
  const [searchParams] = useSearchParams()
  const planet = parsePlanetParam(searchParams.get('planet'))
  const [error, setError] = useState<string | null>(null)
  const createMutation = useMutation({
    mutationFn: createCampaign,
  })

  const submit = async (name: string, description: string) => {
    setError(null)
    try {
      const campaign = await createMutation.mutateAsync(toCampaignInput(name, description))
      if (planet !== null) {
        // Best effort, after the campaign exists. If the planet is taken or the call fails,
        // the campaign simply stays on the first free planet it was given.
        await moveGalaxyPlanet(campaign.id, planet).catch(() => undefined)
      }
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      navigate(`/app/campaigns/${campaign.id}`, { state: { campaignCreated: true } })
    } catch {
      setError("We couldn't save this campaign. Check your connection and try again.")
    }
  }

  return (
    <section aria-labelledby="campaign-create-heading" className="campaign-page campaign-form-page">
      <Link className="campaign-back-link" to="/app/campaigns">
        Back to campaigns
      </Link>
      <div className="campaign-form-page__intro">
        <h1 id="campaign-create-heading">Create a campaign</h1>
        <p>Give your group a name and a place to gather.</p>
      </div>
      {error && (
        <p className="campaign-form__feedback" role="alert">
          {error}
        </p>
      )}
      <CampaignForm
        isPending={createMutation.isPending}
        onCancel={() => navigate('/app/campaigns')}
        onSubmit={submit}
        submitLabel="Create campaign"
      />
    </section>
  )
}
