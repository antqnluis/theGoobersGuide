import { expect, test } from '@playwright/test'
import { localClient, localDatabaseQuery } from './support/localSupabase.ts'

test('connects the browser app to the running local Supabase Auth API', async ({ page }) => {
  const healthResponse = page.waitForResponse((response) =>
    response.url().endsWith('/auth/v1/health'),
  )

  await page.goto('/dev/status')

  const response = await healthResponse
  expect(response.ok()).toBe(true)
  await expect(page.getByText('Connected to the local Supabase Auth API.')).toBeVisible()
})

test('registers and signs in by username or email and enforces profile and campaign access', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const owner = localClient()
  const member = localClient()
  const emailOnly = localClient()
  const anonymous = localClient()
  const run = crypto.randomUUID().slice(0, 12).replace('-', '')
  const emailUsername = `email_${run}`
  const usernameOnly = `player_${run}`
  const email = `${emailUsername}@example.com`
  const password = crypto.randomUUID()

  const register = async (username: string, optionalEmail?: string) => {
    await page.goto('/register')
    await page.getByLabel('Username', { exact: true }).fill(username)
    if (optionalEmail) await page.getByLabel('Email address (optional)').fill(optionalEmail)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
  }
  const signIn = async (identifier: string, secret: string = password) => {
    await page.getByLabel('Username or email').fill(identifier)
    await page.getByLabel('Password', { exact: true }).fill(secret)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
  const signOut = async () => {
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)
  }

  await register(emailUsername.toUpperCase(), email)
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(page.getByText(emailUsername, { exact: true })).toBeVisible()
  await signOut()
  await signIn(emailUsername.toUpperCase())
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await page.reload()
  await expect(page.getByText(emailUsername, { exact: true })).toBeVisible()
  await signOut()
  await signIn(email)
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await signOut()

  await register(usernameOnly)
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await expect(page.getByText(usernameOnly, { exact: true })).toBeVisible()
  await signOut()
  await signIn(usernameOnly.toUpperCase())
  await expect(page).toHaveURL(/\/app\/campaigns$/)
  await signOut()

  const credentialsMessage =
    'Username, email, or password did not match. Check your details and try again.'
  await signIn(usernameOnly, 'incorrect-password')
  await expect(page.getByRole('alert')).toHaveText(credentialsMessage)
  await signIn(`missing_${run}`)
  await expect(page.getByRole('alert')).toHaveText(credentialsMessage)

  await register(usernameOnly.toUpperCase(), `duplicate_${run}@example.com`)
  await expect(page.getByRole('alert')).toContainText('Try a different username or email')

  const { data: ownerAuth, error: ownerError } = await owner.auth.signInWithPassword({
    email,
    password,
  })
  expect(ownerError).toBeNull()

  const { data: tokens, error: memberSignInError } = await member.functions.invoke(
    'sign-in-with-username',
    { body: { username: usernameOnly, password } },
  )
  expect(memberSignInError).toBeNull()
  expect(Object.keys(tokens).sort()).toEqual(['access_token', 'refresh_token'])
  const { data: memberAuth, error: memberSessionError } = await member.auth.setSession(tokens)
  expect(memberSessionError).toBeNull()

  const { data: emailOnlyAuth, error: emailOnlyError } = await emailOnly.auth.signUp({
    email: `email_only_${run}@example.com`,
    password,
  })
  expect(emailOnlyError).toBeNull()
  expect(emailOnlyAuth.session).toBeTruthy()

  for (const client of [anonymous, owner, member]) {
    const lookup = await client.rpc('resolve_username_email', {
      account_username: emailUsername,
    })
    expect(lookup.error).toBeTruthy()
    expect(lookup.data).toBeNull()
  }

  const ownerId = ownerAuth.user!.id
  const memberId = memberAuth.user!.id
  const emailOnlyId = emailOnlyAuth.user!.id
  const campaignIds: string[] = []

  try {
    await test.step('persists campaign management through the browser', async () => {
      await page.goto('/login')
      await signIn(emailUsername)
      await expect(page.getByRole('heading', { name: 'Your campaigns' })).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Your next story starts here.' }),
      ).toBeVisible()

      const campaignName = `Browser campaign ${run}`
      await page.getByRole('link', { name: 'Create campaign', exact: true }).click()
      await page.getByLabel('Campaign name').fill(campaignName)
      await page
        .getByLabel('Description (optional)')
        .fill('Created through the local browser flow.')
      await page.getByRole('button', { name: 'Create campaign', exact: true }).click()
      await expect(page).toHaveURL(/\/app\/campaigns\/[0-9a-f-]+$/)
      await expect(page.getByRole('heading', { name: campaignName })).toBeVisible()
      await expect(page.getByRole('status').filter({ hasText: 'Campaign created.' })).toBeVisible()

      const campaignId = new URL(page.url()).pathname.split('/').at(-1)
      expect(campaignId).toBeTruthy()
      campaignIds.push(campaignId!)
      await page.getByRole('button', { name: 'Party', exact: true }).click()
      const party = page.getByRole('dialog', { name: 'People in this campaign' })
      await expect(
        party.getByRole('listitem').getByText(emailUsername, { exact: true }),
      ).toBeVisible()

      await page.reload()
      await expect(page.getByRole('heading', { name: campaignName })).toBeVisible()
      await page.getByRole('button', { name: 'Campaign settings', exact: true }).click()
      await page.getByRole('button', { name: 'Edit details' }).click()
      await page.getByLabel('Campaign name').fill(`${campaignName} updated`)
      await page.getByRole('button', { name: 'Save changes' }).click()
      await expect(
        page.getByRole('status').filter({ hasText: 'Campaign details saved.' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Back to camp' }).click()
      await expect(page.getByRole('heading', { name: `${campaignName} updated` })).toBeVisible()

      await page.reload()
      await expect(page.getByRole('heading', { name: `${campaignName} updated` })).toBeVisible()
      await page.getByRole('button', { name: 'Campaign settings', exact: true }).click()
      await page.getByRole('button', { name: 'Delete campaign' }).click()
      await page.getByRole('button', { name: 'Keep campaign' }).click()
      await page.getByRole('button', { name: 'Delete campaign' }).click()
      await page.getByRole('button', { name: 'Yes, delete campaign' }).click()
      await expect(page).toHaveURL(/\/app\/campaigns$/)
      await expect(
        page.getByRole('heading', { name: 'Your next story starts here.' }),
      ).toBeVisible()
      campaignIds.splice(campaignIds.indexOf(campaignId!), 1)
    })

    await test.step('creates private profiles and limits profile updates', async () => {
      for (const [client, id, username] of [
        [owner, ownerId, emailUsername],
        [member, memberId, usernameOnly],
        [emailOnly, emailOnlyId, null],
      ] as const) {
        expect(await client.from('profiles').select('id, username')).toMatchObject({
          data: [{ id, username }],
          error: null,
        })
      }

      const { data: initial, error: initialError } = await owner
        .from('profiles')
        .select('created_at, updated_at')
        .single()
      expect(initialError).toBeNull()
      const fields = {
        display_name: 'Campaign Owner',
        avatar_url: 'https://example.com/avatar.png',
      }
      const { data: edited, error: editError } = await owner
        .from('profiles')
        .update(fields)
        .eq('id', ownerId)
        .select()
        .single()
      expect(editError).toBeNull()
      expect(edited).toMatchObject({ ...fields, created_at: initial!.created_at })
      expect(Date.parse(edited!.updated_at)).toBeGreaterThan(Date.parse(initial!.updated_at))

      expect(
        await member.from('profiles').update(fields).eq('id', ownerId).select('id'),
      ).toMatchObject({ data: [], error: null })
      for (const update of [{ id: crypto.randomUUID() }, { username: `rename_${run}` }]) {
        expect(await owner.from('profiles').update(update).eq('id', ownerId)).toMatchObject({
          error: { code: '42501' },
        })
      }
      expect(await owner.from('profiles').insert({ id: ownerId })).toMatchObject({
        error: { code: '42501' },
      })
      expect(await owner.from('profiles').delete().eq('id', ownerId)).toMatchObject({
        error: { code: '42501' },
      })
      expect((await anonymous.from('profiles').select('id')).error).toBeTruthy()
    })

    await test.step('grants campaign and roster access through membership', async () => {
      const { data: campaigns, error: campaignError } = await owner
        .from('campaigns')
        .insert([{ name: `First campaign ${run}` }, { name: `Second campaign ${run}` }])
        .select('id, owner_id, description')
      expect(campaignError).toBeNull()
      campaignIds.push(...campaigns!.map((campaign) => campaign.id))
      expect(campaigns).toMatchObject([
        { owner_id: ownerId, description: null },
        { owner_id: ownerId, description: null },
      ])
      const [firstId, secondId] = campaignIds
      const roster = (client: ReturnType<typeof localClient>, id: string) =>
        client.from('campaign_members').select('profile_id, role').eq('campaign_id', id)

      const memberCount = (client: ReturnType<typeof localClient>, id: string) =>
        client
          .from('campaign_members')
          .select('campaign_id', { count: 'exact', head: true })
          .eq('campaign_id', id)

      expect(await memberCount(owner, firstId)).toMatchObject({ count: 1, error: null })
      expect(await memberCount(member, firstId)).toMatchObject({ count: 0, error: null })

      for (const id of campaignIds) {
        expect(await roster(owner, id)).toMatchObject({
          data: [{ profile_id: ownerId, role: 'owner' }],
          error: null,
        })
      }
      expect(await member.from('campaigns').select('id')).toMatchObject({ data: [], error: null })
      expect(await roster(member, firstId)).toMatchObject({ data: [], error: null })
      expect(
        await member.from('campaigns').insert({ name: 'Forged', owner_id: ownerId }),
      ).toMatchObject({ error: { code: '42501' } })
      expect((await anonymous.from('campaigns').select('id')).error).toBeTruthy()
      expect((await roster(anonymous, firstId)).error).toBeTruthy()

      const namedRoster = (client: ReturnType<typeof localClient>, id: string) =>
        client.rpc('get_campaign_roster', { p_campaign_id: id })
      const ownerRow = { profile_id: ownerId, role: 'owner', username: emailUsername }
      expect(await namedRoster(owner, firstId)).toMatchObject({ data: [ownerRow], error: null })
      expect(await namedRoster(member, firstId)).toMatchObject({ data: [], error: null })
      expect(await namedRoster(owner, crypto.randomUUID())).toMatchObject({
        data: [],
        error: null,
      })
      expect((await namedRoster(anonymous, firstId)).error).toBeTruthy()

      for (const name of ['', '   ', '\t\n']) {
        expect(await owner.from('campaigns').insert({ name })).toMatchObject({
          error: { code: '23514' },
        })
        expect(await owner.from('campaigns').update({ name }).eq('id', firstId)).toMatchObject({
          error: { code: '23514' },
        })
      }

      const fields = { name: 'Renamed campaign', description: 'Shared campaign description' }
      expect(
        await owner.from('campaigns').update(fields).eq('id', firstId).select().single(),
      ).toMatchObject({ data: fields, error: null })
      expect(
        await owner.from('campaigns').update({ owner_id: memberId }).eq('id', firstId),
      ).toMatchObject({ error: { code: '42501' } })

      for (const client of [owner, member, emailOnly, anonymous]) {
        expect(
          await client
            .from('campaign_members')
            .insert({ campaign_id: firstId, profile_id: memberId }),
        ).toMatchObject({ error: { code: '42501' } })
      }

      localDatabaseQuery(
        `insert into public.campaign_members (campaign_id, profile_id)
         values (:'first_id', :'member_id'), (:'first_id', :'email_only_id');`,
        { first_id: firstId, member_id: memberId, email_only_id: emailOnlyId },
      )

      expect(await member.from('campaigns').select('id')).toMatchObject({
        data: [{ id: firstId }],
        error: null,
      })
      expect(
        await member.from('campaigns').select('name, description').eq('id', firstId).single(),
      ).toMatchObject({ data: fields, error: null })
      expect(await member.from('campaigns').select('id').eq('id', secondId)).toMatchObject({
        data: [],
        error: null,
      })
      expect(await namedRoster(member, secondId)).toMatchObject({ data: [], error: null })
      expect(await memberCount(owner, firstId)).toMatchObject({ count: 3, error: null })
      expect(await memberCount(member, firstId)).toMatchObject({ count: 3, error: null })
      expect(await memberCount(member, secondId)).toMatchObject({ count: 0, error: null })
      const expectedRoster = [
        ownerRow,
        { profile_id: memberId, role: 'member', username: usernameOnly },
        { profile_id: emailOnlyId, role: 'member', username: null },
      ]
      for (const client of [owner, member, emailOnly]) {
        const result = await namedRoster(client, firstId)
        expect(result.error).toBeNull()
        expect(result.data).toHaveLength(expectedRoster.length)
        expect(result.data).toEqual(expect.arrayContaining(expectedRoster))
      }
      expect(await member.from('profiles').select('username').eq('id', ownerId)).toMatchObject({
        data: [],
        error: null,
      })
      expect(
        await member
          .from('campaign_members')
          .update({ role: 'owner' })
          .eq('campaign_id', firstId)
          .eq('profile_id', memberId),
      ).toMatchObject({ error: { code: '42501' } })
      for (const client of [owner, member]) {
        expect(
          await client.from('campaign_members').delete().eq('campaign_id', firstId),
        ).toMatchObject({ error: { code: '42501' } })
      }
      expect(
        await member.from('campaigns').update({ name: 'Changed' }).eq('id', firstId).select('id'),
      ).toMatchObject({ data: [], error: null })
      expect(await member.from('campaigns').delete().eq('id', firstId).select('id')).toMatchObject({
        data: [],
        error: null,
      })

      expect(
        await member.from('campaigns').update({ name: 'Changed' }).eq('id', secondId).select('id'),
      ).toMatchObject({ data: [], error: null })
      expect(await member.from('campaigns').delete().eq('id', secondId).select('id')).toMatchObject(
        {
          data: [],
          error: null,
        },
      )
      expect((await anonymous.from('campaigns').insert({ name: 'Anonymous' })).error).toBeTruthy()
      expect(
        (await anonymous.from('campaigns').update(fields).eq('id', firstId)).error,
      ).toBeTruthy()
      expect((await anonymous.from('campaigns').delete().eq('id', firstId)).error).toBeTruthy()
      expect(
        await owner.from('campaigns').select('name, description').eq('id', firstId).single(),
      ).toMatchObject({ data: fields, error: null })

      expect(
        await owner.from('campaigns').delete().eq('id', firstId).select('id').single(),
      ).toMatchObject({ data: { id: firstId }, error: null })
      expect(
        localDatabaseQuery(
          `select count(*) from public.campaign_members where campaign_id = :'campaign_id';`,
          { campaign_id: firstId },
        ),
      ).toBe('0')
      expect(await namedRoster(member, firstId)).toMatchObject({ data: [], error: null })
      expect(await member.from('campaigns').select('id')).toMatchObject({ data: [], error: null })
      expect(await roster(owner, secondId)).toMatchObject({
        data: [{ profile_id: ownerId, role: 'owner' }],
        error: null,
      })
      for (const [client, id] of [
        [owner, ownerId],
        [member, memberId],
        [emailOnly, emailOnlyId],
      ] as const) {
        expect((await client.auth.getUser()).data.user?.id).toBe(id)
        expect(await client.from('profiles').select('id').single()).toMatchObject({
          data: { id },
          error: null,
        })
      }
    })
  } finally {
    const cleanup = campaignIds.length
      ? await owner.from('campaigns').delete().in('id', campaignIds)
      : null
    await Promise.all([owner.auth.signOut(), member.auth.signOut(), emailOnly.auth.signOut()])
    expect(cleanup?.error ?? null).toBeNull()
  }
})

test('campaign invitations grant access only after the addressed player accepts', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const owner = localClient()
  const recipient = localClient()
  const unrelated = localClient()
  const anonymous = localClient()
  const run = crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  const password = crypto.randomUUID()
  const ownerUsername = `host_${run}`
  const recipientUsername = `guest_${run}`
  const unrelatedUsername = `outside_${run}`
  const emailFor = (username: string) => `${username}@example.com`
  const createAccount = async (client: ReturnType<typeof localClient>, username: string) => {
    const { data, error } = await client.auth.signUp({
      email: emailFor(username),
      password,
      options: { data: { username } },
    })
    expect(error).toBeNull()
    expect(data.session).toBeTruthy()
    return data.user!.id
  }
  const signIn = async (username: string) => {
    await page.goto('/login')
    await page.getByLabel('Username or email').fill(emailFor(username))
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page).toHaveURL(/\/app\/campaigns$/)
  }
  const ids: string[] = []

  await page.emulateMedia({ reducedMotion: 'reduce' })
  try {
    await createAccount(owner, ownerUsername)
    const recipientId = await createAccount(recipient, recipientUsername)
    await createAccount(unrelated, unrelatedUsername)

    const campaignName = `Invitation campaign ${run}`
    const { data: campaigns, error } = await owner
      .from('campaigns')
      .insert([{ name: campaignName }, { name: `Invitation race ${run}` }])
      .select('id')
    expect(error).toBeNull()
    ids.push(...campaigns!.map(({ id }) => id))
    const [campaignId, raceCampaignId] = ids
    const send = (client: ReturnType<typeof localClient>, id: string, username: string) =>
      client.rpc('send_campaign_invitation', { p_campaign_id: id, p_username: username })
    const incoming = (client: ReturnType<typeof localClient>) =>
      client.rpc('list_my_campaign_invitations')
    const outgoing = (client: ReturnType<typeof localClient>, id: string) =>
      client.rpc('list_campaign_outgoing_invitations', { p_campaign_id: id })
    const respond = (client: ReturnType<typeof localClient>, id: string, accept: boolean) =>
      client.rpc('respond_to_campaign_invitation', { p_invitation_id: id, p_accept: accept })
    const cancel = (client: ReturnType<typeof localClient>, id: string) =>
      client.rpc('cancel_campaign_invitation', { p_invitation_id: id })

    await signIn(ownerUsername)
    await page.goto(`/app/campaigns/${campaignId}`)
    await page.getByRole('button', { name: 'Party', exact: true }).click()
    await page.getByRole('button', { name: 'Invite player' }).click()
    await page.getByLabel('Player username').fill(unrelatedUsername)
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await page.getByRole('button', { name: `Cancel invitation for ${unrelatedUsername}` }).click()
    await expect(page.getByText('Invitation cancelled.')).toBeVisible()
    await page.getByRole('button', { name: 'Invite player' }).click()
    await page.getByLabel('Player username').fill(`  ${recipientUsername.toUpperCase()}  `)
    await page.getByRole('button', { name: 'Send invitation' }).click()
    await expect(page.getByText('Invitation sent.')).toBeVisible()
    await expect(
      page.getByRole('button', { name: `Cancel invitation for ${recipientUsername}` }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Back to camp' }).click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login$/)

    const { data: inbox, error: inboxError } = await incoming(recipient)
    expect(inboxError).toBeNull()
    expect(inbox).toEqual([
      { id: expect.any(String), campaign_name: campaignName, inviter_username: ownerUsername },
    ])
    const id = inbox![0].id
    expect(await outgoing(owner, campaignId)).toMatchObject({
      data: [{ id, recipient_username: recipientUsername }],
      error: null,
    })
    expect(await outgoing(recipient, campaignId)).toMatchObject({ data: [], error: null })
    expect(await incoming(unrelated)).toMatchObject({ data: [], error: null })
    expect(await incoming(owner)).toMatchObject({ data: [], error: null })
    expect(await recipient.from('campaigns').select('id').eq('id', campaignId)).toMatchObject({
      data: [],
      error: null,
    })
    expect(await recipient.rpc('get_campaign_roster', { p_campaign_id: campaignId })).toMatchObject(
      {
        data: [],
        error: null,
      },
    )

    for (const attempt of [
      send(recipient, campaignId, unrelatedUsername),
      send(anonymous, campaignId, unrelatedUsername),
      respond(unrelated, id, true),
      respond(owner, id, true),
      respond(anonymous, id, true),
      cancel(unrelated, id),
      cancel(recipient, id),
      cancel(anonymous, id),
      incoming(anonymous),
      outgoing(anonymous, campaignId),
    ]) {
      expect((await attempt).error).toBeTruthy()
    }
    expect((await recipient.from('campaign_invitations').select('id')).error).toBeTruthy()
    expect(
      (await owner.from('campaign_invitations').update({ status: 'accepted' }).eq('id', id)).error,
    ).toBeTruthy()
    expect((await send(owner, campaignId, ownerUsername)).error?.message).toBe(
      'campaign_invitation_self',
    )
    expect((await send(owner, campaignId, `missing_${run}`)).error?.message).toBe(
      'campaign_invitation_unknown_username',
    )
    expect((await send(owner, campaignId, recipientUsername)).error?.message).toBe(
      'campaign_invitation_already_pending',
    )

    await signIn(recipientUsername)
    await page.goto(`/app/campaigns/${campaignId}`)
    await expect(page.getByRole('heading', { name: 'Campaign not available' })).toBeVisible()
    await page.getByRole('link', { name: 'Return to your campaigns' }).click()
    await page.getByRole('button', { name: 'My invitations' }).click()
    await page.getByRole('button', { name: `Accept invitation to ${campaignName}` }).click()
    await expect(
      page.getByText('Invitation accepted. The campaign is in Your campaigns.'),
    ).toBeVisible()
    await expect(page.getByRole('button', { name: campaignName, exact: true })).toBeVisible()
    await page.goto(`/app/campaigns/${campaignId}`)
    await expect(page.getByRole('heading', { name: campaignName })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Campaign settings' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Party', exact: true }).click()
    await expect(page.getByRole('list').getByText(ownerUsername, { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invite player' })).toHaveCount(0)
    expect(await incoming(recipient)).toMatchObject({ data: [], error: null })
    expect(await outgoing(owner, campaignId)).toMatchObject({ data: [], error: null })
    expect(await recipient.rpc('get_campaign_roster', { p_campaign_id: campaignId })).toMatchObject(
      {
        data: expect.arrayContaining([
          { profile_id: recipientId, role: 'member', username: recipientUsername },
        ]),
        error: null,
      },
    )
    expect((await send(recipient, campaignId, unrelatedUsername)).error?.code).toBe('42501')
    expect((await send(owner, campaignId, recipientUsername)).error?.message).toBe(
      'campaign_invitation_already_member',
    )
    expect((await respond(recipient, id, true)).error?.message).toBe(
      'campaign_invitation_unavailable',
    )

    const firstSend = await send(owner, raceCampaignId, recipientUsername)
    expect(firstSend.error).toBeNull()
    expect((await respond(recipient, firstSend.data, false)).error).toBeNull()
    const secondSend = await send(owner, raceCampaignId, recipientUsername)
    expect(secondSend.error).toBeNull()
    expect((await cancel(owner, secondSend.data)).error).toBeNull()
    const thirdSend = await send(owner, raceCampaignId, recipientUsername)
    expect(thirdSend.error).toBeNull()

    const [acceptResult, cancelResult] = await Promise.all([
      respond(recipient, thirdSend.data, true),
      cancel(owner, thirdSend.data),
    ])
    expect(
      [acceptResult.error?.message ?? null, cancelResult.error?.message ?? null].sort(),
    ).toEqual(['campaign_invitation_unavailable', null].sort())
    expect(
      await owner
        .from('campaign_members')
        .select('role')
        .eq('campaign_id', raceCampaignId)
        .eq('profile_id', recipientId),
    ).toMatchObject({
      data: acceptResult.error ? [] : [{ role: 'member' }],
      error: null,
    })

    expect((await send(owner, raceCampaignId, unrelatedUsername)).error).toBeNull()
    expect((await owner.from('campaigns').delete().eq('id', raceCampaignId)).error).toBeNull()
    expect(await incoming(unrelated)).toMatchObject({ data: [], error: null })
  } finally {
    const cleanup = ids.length ? await owner.from('campaigns').delete().in('id', ids) : null
    await Promise.all([owner.auth.signOut(), recipient.auth.signOut(), unrelated.auth.signOut()])
    expect(cleanup?.error ?? null).toBeNull()
  }
})
